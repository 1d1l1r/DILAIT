from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from apps.api.app.core import DAY_PRESETS, settings
from apps.api.app.ble.adapter import BLEAdapterError
from apps.api.app.drivers import DriverCandidate, get_driver
from apps.api.app.models import (
    ActionType,
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


def _state_merge(current: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    merged = {**(current or {})}
    merged.update(patch)
    return merged


async def _get_or_404(session, model, item_id: int, options: list[Any] | None = None):
    statement = select(model).where(model.id == item_id)
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


async def apply_device_action(session, device_id: int, action_name: str, payload: dict[str, Any] | None = None) -> Device:
    payload = payload or {}
    device = await _get_or_404(session, Device, device_id)
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

    device.desired_state_json = _state_merge(device.desired_state_json, desired_patch)
    device.known_state_json = _state_merge(device.known_state_json, desired_patch)
    device.last_seen_at = datetime.now(UTC)
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


async def discover_candidates() -> list[DiscoveryCandidateRead]:
    candidate_index: dict[tuple[str, str], DriverCandidate] = {}
    for family in [DeviceFamily.MOCK.value, DeviceFamily.ELK_BLEDOM.value, DeviceFamily.ZENGGE.value, DeviceFamily.BJ_LED.value]:
        for candidate in await get_driver(family).discover_candidates():
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


async def execute_target_action(session, target_type: TargetType, target_id: int, action_name: str, payload: dict[str, Any] | None = None) -> Any:
    payload = payload or {}

    if target_type == TargetType.DEVICE:
        return await apply_device_action(session, target_id, action_name, payload)

    if target_type == TargetType.GROUP:
        group = await _get_or_404(session, Group, target_id, options=[selectinload(Group.devices)])
        for device in group.devices:
            await apply_device_action(session, device.id, action_name, payload)
        return group

    if target_type == TargetType.SCENE:
        scene = await _get_or_404(session, Scene, target_id, options=[selectinload(Scene.actions)])
        for action in scene.actions:
            await execute_target_action(session, action.target_type, action.target_id, action.action_type.value, action.action_payload_json)
        return scene

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
