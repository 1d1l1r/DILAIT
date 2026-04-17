from __future__ import annotations

import logging
import secrets
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from apps.api.app.core import DAY_PRESETS, settings
from apps.api.app.ble.scanner import BleakDiscoveryScanner
from apps.api.app.ble.adapter import BLEAdapterError
from apps.api.app.drivers import DriverCandidate, _bj_led_driver, _elk_driver, _zengge_driver, get_driver
from apps.api.app.models import (
    ActionType,
    ActionLink,
    Device,
    DeviceFamily,
    Group,
    Room,
    RuleRun,
    Scene,
    SceneAction,
    ScheduleRule,
    TargetType,
)
from apps.api.app.schemas import (
    ActionLinkCreate,
    ActionLinkUpdate,
    DeviceCreate,
    DeviceUpdate,
    DiscoveryCandidateRead,
    GroupCreate,
    GroupUpdate,
    RoomCreate,
    RoomUpdate,
    RuleCreate,
    RuleUpdate,
    SceneActionCreate,
    SceneCreate,
    SceneUpdate,
)

LOGGER = logging.getLogger(__name__)


def _state_merge(current: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    merged = {**(current or {})}
    merged.update(patch)
    return merged


@dataclass(slots=True)
class ActionExecutionResult:
    target_type: str
    target_id: int
    action_name: str
    success_count: int = 0
    failure_count: int = 0
    failures: list[dict[str, Any]] = field(default_factory=list)
    children: list[dict[str, Any]] = field(default_factory=list)

    @property
    def status(self) -> str:
        if self.failure_count == 0:
            return "success"
        if self.success_count == 0:
            return "failed"
        return "partial"

    def to_dict(self) -> dict[str, Any]:
        return {
            "target_type": self.target_type,
            "target_id": self.target_id,
            "action_name": self.action_name,
            "status": self.status,
            "success_count": self.success_count,
            "failure_count": self.failure_count,
            "failures": self.failures,
            "children": self.children,
        }


async def _get_or_404(session, model, item_id: int, options: list[Any] | None = None):
    statement = select(model).where(model.id == item_id).execution_options(populate_existing=True)
    for option in options or []:
        statement = statement.options(option)
    result = await session.execute(statement)
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail=f"{model.__name__} {item_id} not found")
    return item


async def list_rooms(session) -> list[Room]:
    result = await session.execute(select(Room).order_by(Room.sort_order, Room.name))
    return result.scalars().all()


async def create_room(session, payload: RoomCreate) -> Room:
    room = Room(name=payload.name, sort_order=payload.sort_order)
    session.add(room)
    await session.commit()
    await session.refresh(room)
    return room


async def update_room(session, room_id: int, payload: RoomUpdate) -> Room:
    room = await _get_or_404(session, Room, room_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(room, field, value)
    await session.commit()
    await session.refresh(room)
    return room


async def delete_room(session, room_id: int) -> None:
    room = await _get_or_404(session, Room, room_id)
    await session.delete(room)
    await session.commit()


async def list_devices(session) -> list[Device]:
    result = await session.execute(select(Device).order_by(Device.name))
    return result.scalars().all()


async def create_device(session, payload: DeviceCreate) -> Device:
    driver = get_driver(payload.family.value)
    capabilities = await driver.get_capabilities()
    metadata = dict(payload.meta_json)
    try:
        probe_result = await driver.probe(payload.ble_identifier, name=payload.name)
        capabilities = probe_result.capabilities
        metadata = {**metadata, "ble": probe_result.metadata}
    except Exception as exc:  # noqa: BLE001
        metadata = {**metadata, "probe_warning": str(exc)}
    now = datetime.now(UTC)
    device = Device(
        name=payload.name,
        family=payload.family,
        ble_identifier=payload.ble_identifier,
        ble_address=payload.ble_address,
        vendor_name=payload.vendor_name,
        room_id=payload.room_id,
        is_enabled=payload.is_enabled,
        capabilities_json=capabilities,
        meta_json=metadata,
        desired_state_json={"is_on": False, "brightness": 100, "rgb": {"r": 255, "g": 255, "b": 255}},
        known_state_json={"is_on": False, "brightness": 100, "rgb": {"r": 255, "g": 255, "b": 255}},
        last_seen_at=now,
    )
    session.add(device)
    await session.commit()
    await session.refresh(device)
    return device


async def update_device(session, device_id: int, payload: DeviceUpdate) -> Device:
    device = await _get_or_404(session, Device, device_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(device, field, value)
    await session.commit()
    await session.refresh(device)
    return device


async def delete_device(session, device_id: int) -> None:
    device = await _get_or_404(session, Device, device_id)
    await session.delete(device)
    await session.commit()


async def _apply_device_action_in_place(device: Device, action_name: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = payload or {}
    driver = get_driver(device.family.value if isinstance(device.family, DeviceFamily) else str(device.family))
    desired_patch: dict[str, Any] = {}

    try:
        if action_name == ActionType.ON.value:
            await driver.turn_on(device)
            desired_patch = {"is_on": True}
        elif action_name == ActionType.OFF.value:
            await driver.turn_off(device)
            desired_patch = {"is_on": False}
        elif action_name == ActionType.TOGGLE.value:
            next_state = not device.known_state_json.get("is_on", False)
            desired_patch = {"is_on": next_state}
            if next_state:
                await driver.turn_on(device)
            else:
                await driver.turn_off(device)
        elif action_name == ActionType.BRIGHTNESS.value:
            value = int(payload["value"])
            await driver.set_brightness(device, value)
            desired_patch = {"is_on": True, "brightness": value}
        elif action_name == ActionType.COLOR.value:
            rgb = {"r": int(payload["r"]), "g": int(payload["g"]), "b": int(payload["b"])}
            await driver.set_rgb(device, rgb["r"], rgb["g"], rgb["b"])
            desired_patch = {"is_on": True, "rgb": rgb}
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported device action: {action_name}")
    except BLEAdapterError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    device.desired_state_json = _state_merge(device.desired_state_json, desired_patch)
    device.known_state_json = _state_merge(device.known_state_json, desired_patch)
    device.last_seen_at = datetime.now(UTC)
    return desired_patch


async def apply_device_action(session, device_id: int, action_name: str, payload: dict[str, Any] | None = None) -> Device:
    device = await _get_or_404(session, Device, device_id)
    await _apply_device_action_in_place(device, action_name, payload)
    await session.commit()
    await session.refresh(device)
    return device


async def list_groups(session) -> list[Group]:
    result = await session.execute(select(Group).options(selectinload(Group.devices)).order_by(Group.name))
    return result.scalars().unique().all()


async def create_group(session, payload: GroupCreate) -> Group:
    group = Group(name=payload.name, room_id=payload.room_id)
    session.add(group)
    await session.commit()
    return await _get_or_404(session, Group, group.id, options=[selectinload(Group.devices)])


async def update_group(session, group_id: int, payload: GroupUpdate) -> Group:
    group = await _get_or_404(session, Group, group_id, options=[selectinload(Group.devices)])
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(group, field, value)
    await session.commit()
    return await _get_or_404(session, Group, group_id, options=[selectinload(Group.devices)])


async def delete_group(session, group_id: int) -> None:
    group = await _get_or_404(session, Group, group_id)
    await session.delete(group)
    await session.commit()


async def add_device_to_group(session, group_id: int, device_id: int) -> Group:
    group = await _get_or_404(session, Group, group_id, options=[selectinload(Group.devices)])
    device = await _get_or_404(session, Device, device_id)
    if all(existing.id != device.id for existing in group.devices):
        group.devices.append(device)
    await session.commit()
    return await _get_or_404(session, Group, group_id, options=[selectinload(Group.devices)])


async def remove_device_from_group(session, group_id: int, device_id: int) -> Group:
    group = await _get_or_404(session, Group, group_id, options=[selectinload(Group.devices)])
    group.devices = [device for device in group.devices if device.id != device_id]
    await session.commit()
    return await _get_or_404(session, Group, group_id, options=[selectinload(Group.devices)])


async def list_scenes(session) -> list[Scene]:
    result = await session.execute(select(Scene).options(selectinload(Scene.actions)).order_by(Scene.name))
    return result.scalars().unique().all()


async def create_scene(session, payload: SceneCreate) -> Scene:
    scene = Scene(name=payload.name, room_id=payload.room_id, is_enabled=payload.is_enabled)
    session.add(scene)
    await session.commit()
    return await _get_or_404(session, Scene, scene.id, options=[selectinload(Scene.actions)])


async def update_scene(session, scene_id: int, payload: SceneUpdate) -> Scene:
    scene = await _get_or_404(session, Scene, scene_id, options=[selectinload(Scene.actions)])
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(scene, field, value)
    await session.commit()
    return await _get_or_404(session, Scene, scene_id, options=[selectinload(Scene.actions)])


async def delete_scene(session, scene_id: int) -> None:
    scene = await _get_or_404(session, Scene, scene_id)
    await session.delete(scene)
    await session.commit()


async def add_scene_action(session, scene_id: int, payload: SceneActionCreate) -> Scene:
    if payload.target_type == TargetType.SCENE:
        raise HTTPException(status_code=400, detail="Scene actions may target only devices or groups")
    if payload.action_type not in {
        ActionType.ON,
        ActionType.OFF,
        ActionType.BRIGHTNESS,
        ActionType.COLOR,
    }:
        raise HTTPException(status_code=400, detail=f"Unsupported scene action: {payload.action_type.value}")
    scene = await _get_or_404(session, Scene, scene_id, options=[selectinload(Scene.actions)])
    action = SceneAction(
        scene_id=scene.id,
        target_type=payload.target_type,
        target_id=payload.target_id,
        action_type=payload.action_type,
        action_payload_json=payload.action_payload_json,
        sort_order=payload.sort_order,
    )
    session.add(action)
    await session.commit()
    return await _get_or_404(session, Scene, scene_id, options=[selectinload(Scene.actions)])


async def delete_scene_action(session, scene_id: int, action_id: int) -> Scene:
    scene = await _get_or_404(session, Scene, scene_id, options=[selectinload(Scene.actions)])
    action = next((item for item in scene.actions if item.id == action_id), None)
    if action is None:
        raise HTTPException(status_code=404, detail=f"SceneAction {action_id} not found")
    await session.delete(action)
    await session.commit()
    return await _get_or_404(session, Scene, scene_id, options=[selectinload(Scene.actions)])


async def discover_candidates() -> list[DiscoveryCandidateRead]:
    candidate_index: dict[tuple[str, str], DriverCandidate] = {}
    mock_driver = get_driver(DeviceFamily.MOCK.value)
    for candidate in await mock_driver.discover_candidates():
        key = (candidate.source, candidate.ble_identifier)
        candidate_index[key] = candidate

    scanner = BleakDiscoveryScanner()
    scan_results = await scanner.scan()
    real_candidates: list[DriverCandidate] = []
    for scan_result in scan_results:
        real_candidates.extend(
            [
                _elk_driver._scan_result_to_candidate(scan_result),
                _zengge_driver._scan_result_to_candidate(scan_result),
                _bj_led_driver._scan_result_to_candidate(scan_result),
            ]
        )

    for candidate in real_candidates:
        key = (candidate.source, candidate.ble_identifier)
        existing = candidate_index.get(key)
        if existing is None:
            candidate_index[key] = candidate
            continue

        should_replace = False
        if candidate.is_supported and not existing.is_supported:
            should_replace = True
        elif existing.family == "Unclassified" and candidate.family != "Unclassified":
            should_replace = True
        elif existing.classification_reason is None and candidate.classification_reason is not None:
            should_replace = True

        if should_replace:
            candidate_index[key] = candidate

    candidates = list(candidate_index.values())
    return [
        DiscoveryCandidateRead(
            family=item.family,
            name=item.name,
            ble_identifier=item.ble_identifier,
            address=item.address,
            vendor_name=item.vendor_name,
            rssi=item.rssi,
            source=item.source,
            is_supported=item.is_supported,
            classification_reason=item.classification_reason,
            services=item.advertised_services or [],
            manufacturer_data=item.manufacturer_data,
            metadata=item.metadata,
        )
        for item in candidates
    ]


async def list_action_links(session) -> list[ActionLink]:
    result = await session.execute(select(ActionLink).order_by(ActionLink.updated_at.desc(), ActionLink.id.desc()))
    return result.scalars().all()


async def _token_exists(session, token: str, exclude_id: int | None = None) -> bool:
    statement = select(ActionLink).where(ActionLink.token == token)
    if exclude_id is not None:
        statement = statement.where(ActionLink.id != exclude_id)
    result = await session.execute(statement)
    return result.scalar_one_or_none() is not None


async def _ensure_action_link_token(session, requested: str | None = None, exclude_id: int | None = None) -> str:
    if requested:
        token = requested.strip()
        if not token:
            raise HTTPException(status_code=400, detail="Action link token cannot be blank")
        if await _token_exists(session, token, exclude_id=exclude_id):
            raise HTTPException(status_code=409, detail=f"Action link token '{token}' already exists")
        return token

    for _ in range(10):
        token = secrets.token_urlsafe(8).replace("-", "").replace("_", "")[:12]
        if token and not await _token_exists(session, token, exclude_id=exclude_id):
            return token
    raise HTTPException(status_code=500, detail="Unable to generate a unique action link token")


def _validate_action_link_target(target_type: TargetType, action_type: ActionType) -> None:
    if target_type == TargetType.SCENE and action_type != ActionType.RUN_SCENE:
        raise HTTPException(status_code=400, detail="Scene action links must use action_type 'run_scene'")
    if target_type != TargetType.SCENE and action_type == ActionType.RUN_SCENE:
        raise HTTPException(status_code=400, detail="'run_scene' action links must target a scene")
    if target_type != TargetType.SCENE and action_type not in {ActionType.ON, ActionType.OFF, ActionType.TOGGLE}:
        raise HTTPException(
            status_code=400,
            detail="Device and group action links support only on, off, or toggle",
        )


async def create_action_link(session, payload: ActionLinkCreate) -> ActionLink:
    _validate_action_link_target(payload.target_type, payload.action_type)
    token = await _ensure_action_link_token(session, payload.token)
    link = ActionLink(
        name=payload.name,
        token=token,
        target_type=payload.target_type,
        target_id=payload.target_id,
        action_type=payload.action_type,
        action_payload_json=payload.action_payload_json,
        is_enabled=payload.is_enabled,
        requires_confirmation=payload.requires_confirmation,
    )
    session.add(link)
    await session.commit()
    await session.refresh(link)
    return link


async def update_action_link(session, action_link_id: int, payload: ActionLinkUpdate) -> ActionLink:
    link = await _get_or_404(session, ActionLink, action_link_id)
    updates = payload.model_dump(exclude_unset=True)
    next_target_type = updates.get("target_type", link.target_type)
    next_action_type = updates.get("action_type", link.action_type)
    _validate_action_link_target(next_target_type, next_action_type)

    if "token" in updates:
        link.token = await _ensure_action_link_token(session, updates["token"], exclude_id=link.id)
        updates.pop("token")

    for field, value in updates.items():
        setattr(link, field, value)
    await session.commit()
    await session.refresh(link)
    return link


async def delete_action_link(session, action_link_id: int) -> None:
    link = await _get_or_404(session, ActionLink, action_link_id)
    await session.delete(link)
    await session.commit()


async def get_action_link_by_token(session, token: str) -> ActionLink:
    result = await session.execute(select(ActionLink).where(ActionLink.token == token))
    link = result.scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=404, detail=f"Action link '{token}' not found")
    return link


async def execute_target_action(session, target_type: TargetType, target_id: int, action_name: str, payload: dict[str, Any] | None = None) -> Any:
    payload = payload or {}

    if target_type == TargetType.DEVICE:
        try:
            device = await _get_or_404(session, Device, target_id)
            await _apply_device_action_in_place(device, action_name, payload)
            await session.flush()
            return ActionExecutionResult(
                target_type=TargetType.DEVICE.value,
                target_id=target_id,
                action_name=action_name,
                success_count=1,
                children=[{"target_type": "device", "target_id": target_id, "name": device.name, "status": "success"}],
            )
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
            LOGGER.warning("Device action failed: target=%s action=%s error=%s", target_id, action_name, detail)
            return ActionExecutionResult(
                target_type=TargetType.DEVICE.value,
                target_id=target_id,
                action_name=action_name,
                failure_count=1,
                failures=[{"target_type": "device", "target_id": target_id, "error": detail}],
            )

    if target_type == TargetType.GROUP:
        group = await _get_or_404(session, Group, target_id, options=[selectinload(Group.devices)])
        result = ActionExecutionResult(target_type=TargetType.GROUP.value, target_id=target_id, action_name=action_name)
        for device in group.devices:
            child_result = await execute_target_action(session, TargetType.DEVICE, device.id, action_name, payload)
            result.success_count += child_result.success_count
            result.failure_count += child_result.failure_count
            result.failures.extend(child_result.failures)
            result.children.append(
                {
                    "target_type": "device",
                    "target_id": device.id,
                    "name": device.name,
                    "family": device.family.value if isinstance(device.family, DeviceFamily) else str(device.family),
                    "status": child_result.status,
                }
            )
        return result

    if target_type == TargetType.SCENE:
        scene = await _get_or_404(session, Scene, target_id, options=[selectinload(Scene.actions)])
        result = ActionExecutionResult(target_type=TargetType.SCENE.value, target_id=target_id, action_name=action_name)
        for action in scene.actions:
            child_result = await execute_target_action(
                session,
                action.target_type,
                action.target_id,
                action.action_type.value,
                action.action_payload_json,
            )
            result.success_count += child_result.success_count
            result.failure_count += child_result.failure_count
            result.failures.extend(child_result.failures)
            result.children.append(
                {
                    "scene_action_id": action.id,
                    "sort_order": action.sort_order,
                    "target_type": action.target_type.value,
                    "target_id": action.target_id,
                    "action_type": action.action_type.value,
                    "status": child_result.status,
                }
            )
        return result

    raise HTTPException(status_code=400, detail=f"Unsupported target type: {target_type}")


async def list_rules(session) -> list[ScheduleRule]:
    result = await session.execute(select(ScheduleRule).order_by(ScheduleRule.next_run_at.is_(None), ScheduleRule.next_run_at, ScheduleRule.created_at))
    return result.scalars().all()


async def _recalculate_rule(rule: ScheduleRule, now: datetime | None = None) -> None:
    from apps.api.app.scheduler import calculate_next_run

    rule.next_run_at = calculate_next_run(rule, now=now)


async def create_rule(session, payload: RuleCreate) -> ScheduleRule:
    rule = ScheduleRule(
        name=payload.name,
        target_type=payload.target_type,
        target_id=payload.target_id,
        rule_type=payload.rule_type,
        is_enabled=payload.is_enabled,
        timezone=payload.timezone,
        days_of_week_mask=payload.days_of_week_mask,
        start_date=payload.start_date,
        end_date=payload.end_date,
        payload_json=payload.payload_json,
    )
    if rule.rule_type.value == "delay" and "delay_seconds" in rule.payload_json:
        rule.next_run_at = datetime.now(UTC) + timedelta(seconds=int(rule.payload_json["delay_seconds"]))
    else:
        await _recalculate_rule(rule)
    session.add(rule)
    await session.commit()
    await session.refresh(rule)
    return rule


async def update_rule(session, rule_id: int, payload: RuleUpdate) -> ScheduleRule:
    rule = await _get_or_404(session, ScheduleRule, rule_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    await _recalculate_rule(rule)
    await session.commit()
    await session.refresh(rule)
    return rule


async def delete_rule(session, rule_id: int) -> None:
    rule = await _get_or_404(session, ScheduleRule, rule_id)
    await session.delete(rule)
    await session.commit()


async def set_rule_enabled(session, rule_id: int, is_enabled: bool) -> ScheduleRule:
    rule = await _get_or_404(session, ScheduleRule, rule_id)
    rule.is_enabled = is_enabled
    await _recalculate_rule(rule)
    await session.commit()
    await session.refresh(rule)
    return rule


async def list_rule_runs(session, rule_id: int) -> list[RuleRun]:
    result = await session.execute(select(RuleRun).where(RuleRun.rule_id == rule_id).order_by(RuleRun.planned_at.desc()))
    return result.scalars().all()


async def list_upcoming_rules(session) -> list[ScheduleRule]:
    result = await session.execute(
        select(ScheduleRule)
        .where(ScheduleRule.is_enabled.is_(True), ScheduleRule.next_run_at.is_not(None))
        .order_by(ScheduleRule.next_run_at)
        .limit(10)
    )
    return result.scalars().all()


async def dashboard_summary(session) -> dict[str, Any]:
    devices_total = await session.scalar(select(func.count(Device.id))) or 0
    groups_total = await session.scalar(select(func.count(Group.id))) or 0
    scenes_total = await session.scalar(select(func.count(Scene.id))) or 0
    enabled_rules_total = await session.scalar(select(func.count(ScheduleRule.id)).where(ScheduleRule.is_enabled.is_(True))) or 0

    upcoming_rules = await list_upcoming_rules(session)
    failures_result = await session.execute(
        select(RuleRun).where(RuleRun.status == "failed").order_by(RuleRun.planned_at.desc()).limit(5)
    )
    recent_failures = failures_result.scalars().all()
    return {
        "devices_total": devices_total,
        "groups_total": groups_total,
        "scenes_total": scenes_total,
        "enabled_rules_total": enabled_rules_total,
        "upcoming_rules": upcoming_rules,
        "recent_failures": recent_failures,
        "day_presets": DAY_PRESETS,
        "default_timezone": settings.default_timezone,
    }
