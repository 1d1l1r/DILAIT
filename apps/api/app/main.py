from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import UTC, datetime
from html import escape
import logging

import uvicorn
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.app.core import STATIC_DIR, get_session, init_db, settings
from apps.api.app.drivers import SUPPORTED_FAMILIES
from apps.api.app.models import TargetType
from apps.api.app.scheduler import SchedulerEngine
from apps.api.app.schemas import (
    ActionLinkCreate,
    ActionLinkRead,
    ActionLinkUpdate,
    BrightnessRequest,
    ColorRequest,
    DashboardRead,
    DeviceCreate,
    DeviceRead,
    DeviceUpdate,
    DiscoveryCandidateRead,
    GroupCreate,
    GroupDeviceAttach,
    GroupRead,
    GroupUpdate,
    RoomCreate,
    RoomRead,
    RoomUpdate,
    RuleCreate,
    RuleRead,
    RuleRunRead,
    RuleUpdate,
    SceneActionCreate,
    SceneCreate,
    SceneRead,
    SceneUpdate,
    SystemInfoRead,
)
from apps.api.app.services import (
    add_device_to_group,
    add_scene_action,
    apply_device_action,
    create_action_link,
    create_device,
    create_group,
    create_room,
    create_rule,
    create_scene,
    dashboard_summary,
    delete_action_link,
    delete_device,
    delete_group,
    delete_room,
    delete_rule,
    delete_scene_action,
    delete_scene,
    discover_candidates,
    execute_target_action,
    get_action_link_by_token,
    list_devices,
    list_groups,
    list_rooms,
    list_action_links,
    list_rule_runs,
    list_rules,
    list_scenes,
    list_upcoming_rules,
    remove_device_from_group,
    set_rule_enabled,
    update_action_link,
    update_device,
    update_group,
    update_room,
    update_rule,
    update_scene,
)

APP_LOGGER = logging.getLogger("apps")
APP_LOGGER.setLevel(logging.INFO)
if not APP_LOGGER.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(levelname)s:%(name)s:%(message)s"))
    APP_LOGGER.addHandler(handler)
APP_LOGGER.propagate = False

scheduler_engine = SchedulerEngine(settings.scheduler_poll_seconds)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    await scheduler_engine.start()
    try:
        yield
    finally:
        await scheduler_engine.stop()


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.middleware("http")
async def disable_ui_cache(request: Request, call_next):
    response = await call_next(request)
    if request.url.path in {"/", "/advanced", "/advanced/"} or request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


def _render_action_link_page(
    *,
    title: str,
    body: str,
    tone: str = "success",
    primary_href: str | None = None,
    primary_label: str | None = None,
    secondary_href: str | None = None,
    secondary_label: str | None = None,
) -> HTMLResponse:
    accent = {
        "success": "#2f9e44",
        "warning": "#c77d17",
        "error": "#c92a2a",
    }.get(tone, "#ef6b4a")
    primary = (
        f'<a class="action-link-button" href="{escape(primary_href)}">{escape(primary_label or "Continue")}</a>'
        if primary_href
        else ""
    )
    secondary = (
        f'<a class="action-link-secondary" href="{escape(secondary_href)}">{escape(secondary_label or "Back")}</a>'
        if secondary_href
        else ""
    )
    return HTMLResponse(
        f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{escape(title)}</title>
    <link rel="stylesheet" href="/static/styles.css" />
    <style>
      body {{
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 16px;
      }}
      .action-link-page {{
        width: min(100%, 460px);
        background: rgba(255, 250, 245, 0.96);
        border: 1px solid rgba(24, 34, 43, 0.08);
        border-radius: 24px;
        box-shadow: 0 20px 48px rgba(58, 37, 16, 0.12);
        padding: 24px;
      }}
      .action-link-pill {{
        display: inline-flex;
        align-items: center;
        padding: 6px 12px;
        border-radius: 999px;
        color: white;
        background: {accent};
        font-size: 0.82rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }}
      .action-link-actions {{
        display: grid;
        gap: 10px;
        margin-top: 18px;
      }}
      .action-link-button,
      .action-link-secondary {{
        display: inline-flex;
        justify-content: center;
        text-decoration: none;
        border-radius: 14px;
        padding: 13px 16px;
        font-weight: 700;
      }}
      .action-link-button {{
        color: white;
        background: linear-gradient(135deg, #ef6b4a, #ff946e);
      }}
      .action-link-secondary {{
        color: #18222b;
        border: 1px solid rgba(24, 34, 43, 0.14);
        background: rgba(255, 255, 255, 0.72);
      }}
    </style>
  </head>
  <body>
    <main class="action-link-page">
      <div class="action-link-pill">{escape(tone)}</div>
      <h1>{escape(title)}</h1>
      <p class="muted">{body}</p>
      <div class="action-link-actions">{primary}{secondary}</div>
    </main>
  </body>
</html>"""
    )


@app.get("/")
async def root() -> FileResponse:
    return FileResponse(
        STATIC_DIR / "index.html",
        headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
    )


@app.get("/advanced")
@app.get("/advanced/")
async def advanced() -> FileResponse:
    return FileResponse(
        STATIC_DIR / "advanced.html",
        headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
    )


@app.get("/a/{token}", response_class=HTMLResponse)
async def action_link_open(
    token: str,
    request: Request,
    confirm: bool = False,
    session: AsyncSession = Depends(get_session),
) -> HTMLResponse:
    try:
        link = await get_action_link_by_token(session, token)
    except HTTPException:
        return _render_action_link_page(
            title="Action link not found",
            body="This local action link does not exist here anymore.",
            tone="error",
            secondary_href="/",
            secondary_label="Open hub",
        )

    if not link.is_enabled:
        return _render_action_link_page(
            title="Action link disabled",
            body=f"'{link.name}' is currently disabled, so nothing was executed.",
            tone="warning",
            secondary_href="/",
            secondary_label="Open hub",
        )

    if link.requires_confirmation and not confirm:
        return _render_action_link_page(
            title=link.name,
            body=(
                f"This link will run '{link.action_type.value}' for "
                f"{link.target_type.value} #{link.target_id} on this local hub."
            ),
            tone="warning",
            primary_href=str(request.url.include_query_params(confirm="1")),
            primary_label="Run now",
            secondary_href="/",
            secondary_label="Cancel",
        )

    try:
        result = await execute_target_action(
            session,
            target_type=link.target_type,
            target_id=link.target_id,
            action_name=link.action_type.value,
            payload=link.action_payload_json,
        )
    except HTTPException as exc:
        link.last_used_at = datetime.now(UTC)
        await session.commit()
        return _render_action_link_page(
            title=f"{link.name} failed",
            body=f"The action link could not run: {escape(str(exc.detail))}",
            tone="error",
            secondary_href="/",
            secondary_label="Back to hub",
        )
    link.last_used_at = datetime.now(UTC)
    await session.commit()

    if result.failure_count == 0:
        return _render_action_link_page(
            title=f"{link.name} completed",
            body=(
                f"Executed '{link.action_type.value}' for {link.target_type.value} #{link.target_id}. "
                f"{result.success_count} sub-action(s) completed."
            ),
            tone="success",
            secondary_href="/",
            secondary_label="Back to hub",
        )

    if result.success_count > 0:
        return _render_action_link_page(
            title=f"{link.name} partially completed",
            body=(
                f"{result.success_count} sub-action(s) succeeded and {result.failure_count} failed. "
                f"Check the local hub logs for the exact device errors."
            ),
            tone="warning",
            secondary_href="/",
            secondary_label="Back to hub",
        )

    return _render_action_link_page(
        title=f"{link.name} failed",
        body="The action link ran, but every targeted action failed. Check the local hub logs for details.",
        tone="error",
        secondary_href="/",
        secondary_label="Back to hub",
    )


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/system/info", response_model=SystemInfoRead)
async def system_info() -> SystemInfoRead:
    return SystemInfoRead(
        app_name=settings.app_name,
        timezone=settings.default_timezone,
        database_url=settings.database_url,
        supported_families=SUPPORTED_FAMILIES,
    )


@app.get("/api/dashboard", response_model=DashboardRead)
async def dashboard(session: AsyncSession = Depends(get_session)) -> DashboardRead:
    summary = await dashboard_summary(session)
    return DashboardRead(**summary)


@app.get("/api/rooms", response_model=list[RoomRead])
async def rooms(session: AsyncSession = Depends(get_session)) -> list[RoomRead]:
    return [RoomRead.model_validate(room) for room in await list_rooms(session)]


@app.post("/api/rooms", response_model=RoomRead)
async def rooms_create(payload: RoomCreate, session: AsyncSession = Depends(get_session)) -> RoomRead:
    return RoomRead.model_validate(await create_room(session, payload))


@app.patch("/api/rooms/{room_id}", response_model=RoomRead)
async def rooms_update(room_id: int, payload: RoomUpdate, session: AsyncSession = Depends(get_session)) -> RoomRead:
    return RoomRead.model_validate(await update_room(session, room_id, payload))


@app.delete("/api/rooms/{room_id}")
async def rooms_delete(room_id: int, session: AsyncSession = Depends(get_session)) -> dict[str, bool]:
    await delete_room(session, room_id)
    return {"ok": True}


@app.get("/api/devices", response_model=list[DeviceRead])
async def devices(session: AsyncSession = Depends(get_session)) -> list[DeviceRead]:
    return [DeviceRead.model_validate(device) for device in await list_devices(session)]


@app.post("/api/devices/discover", response_model=list[DiscoveryCandidateRead])
async def devices_discover() -> list[DiscoveryCandidateRead]:
    return await discover_candidates()


@app.post("/api/devices", response_model=DeviceRead)
async def devices_create(payload: DeviceCreate, session: AsyncSession = Depends(get_session)) -> DeviceRead:
    return DeviceRead.model_validate(await create_device(session, payload))


@app.patch("/api/devices/{device_id}", response_model=DeviceRead)
async def devices_update(device_id: int, payload: DeviceUpdate, session: AsyncSession = Depends(get_session)) -> DeviceRead:
    return DeviceRead.model_validate(await update_device(session, device_id, payload))


@app.delete("/api/devices/{device_id}")
async def devices_delete(device_id: int, session: AsyncSession = Depends(get_session)) -> dict[str, bool]:
    await delete_device(session, device_id)
    return {"ok": True}


@app.post("/api/devices/{device_id}/on", response_model=DeviceRead)
async def devices_on(device_id: int, session: AsyncSession = Depends(get_session)) -> DeviceRead:
    return DeviceRead.model_validate(await apply_device_action(session, device_id, "on"))


@app.post("/api/devices/{device_id}/off", response_model=DeviceRead)
async def devices_off(device_id: int, session: AsyncSession = Depends(get_session)) -> DeviceRead:
    return DeviceRead.model_validate(await apply_device_action(session, device_id, "off"))


@app.post("/api/devices/{device_id}/brightness", response_model=DeviceRead)
async def devices_brightness(
    device_id: int,
    payload: BrightnessRequest,
    session: AsyncSession = Depends(get_session),
) -> DeviceRead:
    return DeviceRead.model_validate(await apply_device_action(session, device_id, "brightness", payload.model_dump()))


@app.post("/api/devices/{device_id}/color", response_model=DeviceRead)
async def devices_color(device_id: int, payload: ColorRequest, session: AsyncSession = Depends(get_session)) -> DeviceRead:
    return DeviceRead.model_validate(await apply_device_action(session, device_id, "color", payload.model_dump()))


@app.get("/api/groups", response_model=list[GroupRead])
async def groups(session: AsyncSession = Depends(get_session)) -> list[GroupRead]:
    return [GroupRead.model_validate(group) for group in await list_groups(session)]


@app.post("/api/groups", response_model=GroupRead)
async def groups_create(payload: GroupCreate, session: AsyncSession = Depends(get_session)) -> GroupRead:
    return GroupRead.model_validate(await create_group(session, payload))


@app.patch("/api/groups/{group_id}", response_model=GroupRead)
async def groups_update(group_id: int, payload: GroupUpdate, session: AsyncSession = Depends(get_session)) -> GroupRead:
    return GroupRead.model_validate(await update_group(session, group_id, payload))


@app.delete("/api/groups/{group_id}")
async def groups_delete(group_id: int, session: AsyncSession = Depends(get_session)) -> dict[str, bool]:
    await delete_group(session, group_id)
    return {"ok": True}


@app.post("/api/groups/{group_id}/devices", response_model=GroupRead)
async def groups_add_device(
    group_id: int,
    payload: GroupDeviceAttach,
    session: AsyncSession = Depends(get_session),
) -> GroupRead:
    return GroupRead.model_validate(await add_device_to_group(session, group_id, payload.device_id))


@app.delete("/api/groups/{group_id}/devices/{device_id}", response_model=GroupRead)
async def groups_remove_device(group_id: int, device_id: int, session: AsyncSession = Depends(get_session)) -> GroupRead:
    return GroupRead.model_validate(await remove_device_from_group(session, group_id, device_id))


@app.post("/api/groups/{group_id}/on", response_model=GroupRead)
async def groups_on(group_id: int, session: AsyncSession = Depends(get_session)) -> GroupRead:
    await execute_target_action(session, target_type=TargetType.GROUP, target_id=group_id, action_name="on")
    await session.commit()
    groups = await list_groups(session)
    group = next(item for item in groups if item.id == group_id)
    return GroupRead.model_validate(group)


@app.post("/api/groups/{group_id}/off", response_model=GroupRead)
async def groups_off(group_id: int, session: AsyncSession = Depends(get_session)) -> GroupRead:
    await execute_target_action(session, target_type=TargetType.GROUP, target_id=group_id, action_name="off")
    await session.commit()
    groups = await list_groups(session)
    group = next(item for item in groups if item.id == group_id)
    return GroupRead.model_validate(group)


@app.post("/api/groups/{group_id}/brightness", response_model=GroupRead)
async def groups_brightness(
    group_id: int,
    payload: BrightnessRequest,
    session: AsyncSession = Depends(get_session),
) -> GroupRead:
    await execute_target_action(
        session,
        target_type=TargetType.GROUP,
        target_id=group_id,
        action_name="brightness",
        payload=payload.model_dump(),
    )
    await session.commit()
    groups = await list_groups(session)
    group = next(item for item in groups if item.id == group_id)
    return GroupRead.model_validate(group)


@app.post("/api/groups/{group_id}/color", response_model=GroupRead)
async def groups_color(group_id: int, payload: ColorRequest, session: AsyncSession = Depends(get_session)) -> GroupRead:
    await execute_target_action(
        session,
        target_type=TargetType.GROUP,
        target_id=group_id,
        action_name="color",
        payload=payload.model_dump(),
    )
    await session.commit()
    groups = await list_groups(session)
    group = next(item for item in groups if item.id == group_id)
    return GroupRead.model_validate(group)


@app.get("/api/scenes", response_model=list[SceneRead])
async def scenes(session: AsyncSession = Depends(get_session)) -> list[SceneRead]:
    return [SceneRead.model_validate(scene) for scene in await list_scenes(session)]


@app.post("/api/scenes", response_model=SceneRead)
async def scenes_create(payload: SceneCreate, session: AsyncSession = Depends(get_session)) -> SceneRead:
    return SceneRead.model_validate(await create_scene(session, payload))


@app.patch("/api/scenes/{scene_id}", response_model=SceneRead)
async def scenes_update(scene_id: int, payload: SceneUpdate, session: AsyncSession = Depends(get_session)) -> SceneRead:
    return SceneRead.model_validate(await update_scene(session, scene_id, payload))


@app.delete("/api/scenes/{scene_id}")
async def scenes_delete(scene_id: int, session: AsyncSession = Depends(get_session)) -> dict[str, bool]:
    await delete_scene(session, scene_id)
    return {"ok": True}


@app.post("/api/scenes/{scene_id}/actions", response_model=SceneRead)
async def scenes_add_action(
    scene_id: int,
    payload: SceneActionCreate,
    session: AsyncSession = Depends(get_session),
) -> SceneRead:
    return SceneRead.model_validate(await add_scene_action(session, scene_id, payload))


@app.delete("/api/scenes/{scene_id}/actions/{action_id}", response_model=SceneRead)
async def scenes_delete_action(
    scene_id: int,
    action_id: int,
    session: AsyncSession = Depends(get_session),
) -> SceneRead:
    return SceneRead.model_validate(await delete_scene_action(session, scene_id, action_id))


@app.post("/api/scenes/{scene_id}/run", response_model=SceneRead)
async def scenes_run(scene_id: int, session: AsyncSession = Depends(get_session)) -> SceneRead:
    await execute_target_action(session, target_type=TargetType.SCENE, target_id=scene_id, action_name="run_scene")
    await session.commit()
    scenes = await list_scenes(session)
    scene = next(item for item in scenes if item.id == scene_id)
    return SceneRead.model_validate(scene)


@app.get("/api/action-links", response_model=list[ActionLinkRead])
async def action_links(session: AsyncSession = Depends(get_session)) -> list[ActionLinkRead]:
    return [ActionLinkRead.model_validate(item) for item in await list_action_links(session)]


@app.post("/api/action-links", response_model=ActionLinkRead)
async def action_links_create(payload: ActionLinkCreate, session: AsyncSession = Depends(get_session)) -> ActionLinkRead:
    return ActionLinkRead.model_validate(await create_action_link(session, payload))


@app.patch("/api/action-links/{action_link_id}", response_model=ActionLinkRead)
async def action_links_update(
    action_link_id: int,
    payload: ActionLinkUpdate,
    session: AsyncSession = Depends(get_session),
) -> ActionLinkRead:
    return ActionLinkRead.model_validate(await update_action_link(session, action_link_id, payload))


@app.delete("/api/action-links/{action_link_id}")
async def action_links_delete(action_link_id: int, session: AsyncSession = Depends(get_session)) -> dict[str, bool]:
    await delete_action_link(session, action_link_id)
    return {"ok": True}


@app.get("/api/rules", response_model=list[RuleRead])
async def rules(session: AsyncSession = Depends(get_session)) -> list[RuleRead]:
    return [RuleRead.model_validate(rule) for rule in await list_rules(session)]


@app.post("/api/rules", response_model=RuleRead)
async def rules_create(payload: RuleCreate, session: AsyncSession = Depends(get_session)) -> RuleRead:
    return RuleRead.model_validate(await create_rule(session, payload))


@app.patch("/api/rules/{rule_id}", response_model=RuleRead)
async def rules_update(rule_id: int, payload: RuleUpdate, session: AsyncSession = Depends(get_session)) -> RuleRead:
    return RuleRead.model_validate(await update_rule(session, rule_id, payload))


@app.delete("/api/rules/{rule_id}")
async def rules_delete(rule_id: int, session: AsyncSession = Depends(get_session)) -> dict[str, bool]:
    await delete_rule(session, rule_id)
    return {"ok": True}


@app.post("/api/rules/{rule_id}/enable", response_model=RuleRead)
async def rules_enable(rule_id: int, session: AsyncSession = Depends(get_session)) -> RuleRead:
    return RuleRead.model_validate(await set_rule_enabled(session, rule_id, True))


@app.post("/api/rules/{rule_id}/disable", response_model=RuleRead)
async def rules_disable(rule_id: int, session: AsyncSession = Depends(get_session)) -> RuleRead:
    return RuleRead.model_validate(await set_rule_enabled(session, rule_id, False))


@app.get("/api/rules/{rule_id}/runs", response_model=list[RuleRunRead])
async def rules_runs(rule_id: int, session: AsyncSession = Depends(get_session)) -> list[RuleRunRead]:
    return [RuleRunRead.model_validate(item) for item in await list_rule_runs(session, rule_id)]


@app.get("/api/rules/upcoming", response_model=list[RuleRead])
async def rules_upcoming(session: AsyncSession = Depends(get_session)) -> list[RuleRead]:
    return [RuleRead.model_validate(rule) for rule in await list_upcoming_rules(session)]


if __name__ == "__main__":
    uvicorn.run("apps.api.app.main:app", host="127.0.0.1", port=8000, reload=True)
