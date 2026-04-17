from __future__ import annotations

import asyncio
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from apps.api.app import core, main as main_module
from apps.api.app.core import init_db
from apps.api.app.main import app
from apps.api.app.models import Base, DeviceFamily
from apps.api.app.scheduler import RuleExecutor


class FakeBJDriver:
    family = DeviceFamily.BJ_LED.value

    async def discover_candidates(self):
        return []

    async def probe(self, ble_identifier: str, name: str | None = None):
        return type(
            "ProbeResult",
            (),
            {
                "family": self.family,
                "capabilities": await self.get_capabilities(),
                "metadata": {"simulated": True, "driver_profile": "fake_bj"},
            },
        )()

    async def turn_on(self, device):
        if device.ble_identifier.endswith("fail"):
            raise RuntimeError("simulated BJ failure")

    async def turn_off(self, device):
        if device.ble_identifier.endswith("fail"):
            raise RuntimeError("simulated BJ failure")

    async def set_brightness(self, device, value: int):
        if device.ble_identifier.endswith("fail"):
            raise RuntimeError("simulated BJ failure")

    async def set_rgb(self, device, r: int, g: int, b: int):
        if device.ble_identifier.endswith("fail"):
            raise RuntimeError("simulated BJ failure")

    async def get_capabilities(self, device=None):
        return {
            "power": True,
            "brightness": True,
            "rgb": True,
            "white_channel": False,
            "effects": False,
            "readback_state": False,
        }


def reset_database():
    async def _reset():
        async with core.engine.begin() as connection:
            await connection.run_sync(Base.metadata.drop_all)
            await connection.run_sync(Base.metadata.create_all)
        await init_db()

    asyncio.run(_reset())


def apply_session_factory():
    return core.async_session_factory


def install_temp_database():
    handle = tempfile.NamedTemporaryFile(prefix="lights-hub-test-", suffix=".db", delete=False)
    handle.close()
    db_path = Path(handle.name)
    database_url = f"sqlite+aiosqlite:///{db_path.as_posix()}"
    engine = create_async_engine(database_url, future=True)
    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    originals = {
        "database_url": core.settings.database_url,
        "engine": core.engine,
        "session_factory": core.async_session_factory,
        "scheduler_session_factory": main_module.scheduler_engine._executor.session_factory,
    }
    core.settings.database_url = database_url
    core.engine = engine
    core.async_session_factory = session_factory
    main_module.scheduler_engine._executor.session_factory = session_factory
    return db_path, originals


def restore_temp_database(db_path: Path, originals):
    current_engine = core.engine
    asyncio.run(current_engine.dispose())
    core.settings.database_url = originals["database_url"]
    core.engine = originals["engine"]
    core.async_session_factory = originals["session_factory"]
    main_module.scheduler_engine._executor.session_factory = originals["scheduler_session_factory"]
    if db_path.exists():
        db_path.unlink()


def install_fake_bj_driver():
    from apps.api.app.drivers import DRIVER_REGISTRY

    driver = FakeBJDriver()
    original = {
        DeviceFamily.BJ_LED.value: DRIVER_REGISTRY[DeviceFamily.BJ_LED.value],
        DeviceFamily.MOHUANLED.value: DRIVER_REGISTRY[DeviceFamily.MOHUANLED.value],
    }
    DRIVER_REGISTRY[DeviceFamily.BJ_LED.value] = driver
    DRIVER_REGISTRY[DeviceFamily.MOHUANLED.value] = driver
    return original


def restore_fake_bj_driver(original):
    from apps.api.app.drivers import DRIVER_REGISTRY

    for family, driver in original.items():
        DRIVER_REGISTRY[family] = driver


def create_device(client: TestClient, *, name: str, family: str, ble_identifier: str):
    response = client.post(
        "/api/devices",
        json={"name": name, "family": family, "ble_identifier": ble_identifier},
    )
    assert response.status_code == 200
    return response.json()


def test_device_rule_flow():
    db_path, originals = install_temp_database()
    try:
        reset_database()
        client = TestClient(app)

        device = create_device(client, name="Test strip", family="mock", ble_identifier="mock://test-strip")
        assert device["meta_json"]["ble"]["simulated"] is True

        on_response = client.post(f"/api/devices/{device['id']}/on")
        assert on_response.status_code == 200
        assert on_response.json()["known_state_json"]["is_on"] is True

        delay_rule = client.post(
            "/api/rules",
            json={
                "name": "Immediate off",
                "target_type": "device",
                "target_id": device["id"],
                "rule_type": "delay",
                "timezone": "Asia/Qyzylorda",
                "days_of_week_mask": 127,
                "payload_json": {"action": "off", "delay_seconds": 0},
            },
        )
        assert delay_rule.status_code == 200
        rule = delay_rule.json()
        assert rule["next_run_at"] is not None

        asyncio.run(RuleExecutor(apply_session_factory()).run_once())

        runs_response = client.get(f"/api/rules/{rule['id']}/runs")
        assert runs_response.status_code == 200
        runs = runs_response.json()
        assert len(runs) == 1
        assert runs[0]["status"] == "success"
    finally:
        restore_temp_database(db_path, originals)


def test_mixed_family_group_and_scene_actions():
    db_path, originals = install_temp_database()
    original_registry = install_fake_bj_driver()
    try:
        reset_database()
        client = TestClient(app)
        mock_device = create_device(client, name="Desk mock", family="mock", ble_identifier="mock://desk")
        bj_device = create_device(client, name="Desk BJ", family="BJ_LED", ble_identifier="test://bj-ok")

        group = client.post("/api/groups", json={"name": "Mixed desk"}).json()
        client.post(f"/api/groups/{group['id']}/devices", json={"device_id": mock_device["id"]})
        client.post(f"/api/groups/{group['id']}/devices", json={"device_id": bj_device["id"]})

        group_on = client.post(f"/api/groups/{group['id']}/on")
        assert group_on.status_code == 200
        devices = client.get("/api/devices").json()
        assert {device["family"] for device in devices} == {"mock", "BJ_LED"}
        assert all(device["known_state_json"]["is_on"] is True for device in devices)

        scene = client.post("/api/scenes", json={"name": "Mixed scene"}).json()
        add_group_action = client.post(
            f"/api/scenes/{scene['id']}/actions",
            json={
                "target_type": "group",
                "target_id": group["id"],
                "action_type": "color",
                "action_payload_json": {"r": 0, "g": 255, "b": 0},
            },
        )
        assert add_group_action.status_code == 200
        add_device_action = client.post(
            f"/api/scenes/{scene['id']}/actions",
            json={
                "target_type": "device",
                "target_id": mock_device["id"],
                "action_type": "off",
                "action_payload_json": {},
            },
        )
        assert add_device_action.status_code == 200

        run_scene = client.post(f"/api/scenes/{scene['id']}/run")
        assert run_scene.status_code == 200

        after = {device["id"]: device for device in client.get("/api/devices").json()}
        assert after[mock_device["id"]]["known_state_json"]["is_on"] is False
        assert after[bj_device["id"]]["known_state_json"]["is_on"] is True
        assert after[bj_device["id"]]["known_state_json"]["rgb"] == {"r": 0, "g": 255, "b": 0}
    finally:
        restore_fake_bj_driver(original_registry)
        restore_temp_database(db_path, originals)


def test_partial_group_failure_does_not_block_other_devices():
    db_path, originals = install_temp_database()
    original_registry = install_fake_bj_driver()
    try:
        reset_database()
        client = TestClient(app)
        mock_device = create_device(client, name="Good mock", family="mock", ble_identifier="mock://good")
        failing_bj = create_device(client, name="Fail BJ", family="BJ_LED", ble_identifier="test://bj-fail")

        group = client.post("/api/groups", json={"name": "Partial group"}).json()
        client.post(f"/api/groups/{group['id']}/devices", json={"device_id": mock_device["id"]})
        client.post(f"/api/groups/{group['id']}/devices", json={"device_id": failing_bj["id"]})

        group_on = client.post(f"/api/groups/{group['id']}/on")
        assert group_on.status_code == 200

        devices = {device["id"]: device for device in client.get("/api/devices").json()}
        assert devices[mock_device["id"]]["known_state_json"]["is_on"] is True
        assert devices[failing_bj["id"]]["known_state_json"]["is_on"] is False
    finally:
        restore_fake_bj_driver(original_registry)
        restore_temp_database(db_path, originals)


def test_action_links_immediate_and_confirmation_modes():
    db_path, originals = install_temp_database()
    try:
        reset_database()
        client = TestClient(app)

        device = create_device(client, name="Link strip", family="mock", ble_identifier="mock://link-strip")
        scene = client.post("/api/scenes", json={"name": "Link scene"}).json()
        client.post(
            f"/api/scenes/{scene['id']}/actions",
            json={
                "target_type": "device",
                "target_id": device["id"],
                "action_type": "off",
                "action_payload_json": {},
            },
        )

        immediate = client.post(
            "/api/action-links",
            json={
                "name": "Turn on now",
                "target_type": "device",
                "target_id": device["id"],
                "action_type": "on",
                "requires_confirmation": False,
            },
        )
        assert immediate.status_code == 200
        response = client.get(f"/a/{immediate.json()['token']}")
        assert response.status_code == 200
        assert "completed" in response.text
        assert client.get("/api/devices").json()[0]["known_state_json"]["is_on"] is True

        confirmed = client.post(
            "/api/action-links",
            json={
                "name": "Run scene with confirm",
                "target_type": "scene",
                "target_id": scene["id"],
                "action_type": "run_scene",
                "requires_confirmation": True,
            },
        )
        assert confirmed.status_code == 200

        confirm_page = client.get(f"/a/{confirmed.json()['token']}")
        assert confirm_page.status_code == 200
        assert "Run now" in confirm_page.text
        assert client.get("/api/devices").json()[0]["known_state_json"]["is_on"] is True

        executed = client.get(f"/a/{confirmed.json()['token']}?confirm=true")
        assert executed.status_code == 200
        assert "completed" in executed.text
        assert client.get("/api/devices").json()[0]["known_state_json"]["is_on"] is False
    finally:
        restore_temp_database(db_path, originals)


def test_ui_shell_routes_are_split():
    client = TestClient(app)

    root = client.get("/")
    advanced = client.get("/advanced")

    assert root.status_code == 200
    assert advanced.status_code == 200
    assert "Rooms first control for everyday use." in root.text
    assert "Lights Hub Panel" in advanced.text


def test_rule_can_be_retargeted_and_retyped():
    db_path, originals = install_temp_database()
    try:
        reset_database()
        client = TestClient(app)

        device = create_device(client, name="Schedule strip", family="mock", ble_identifier="mock://schedule-strip")
        scene = client.post("/api/scenes", json={"name": "Schedule scene"}).json()

        create = client.post(
            "/api/rules",
            json={
                "name": "Night off",
                "target_type": "device",
                "target_id": device["id"],
                "rule_type": "recurring",
                "timezone": "Asia/Qyzylorda",
                "days_of_week_mask": 127,
                "payload_json": {"action": "off", "time": "22:30:00"},
            },
        )
        assert create.status_code == 200
        rule = create.json()

        update = client.patch(
            f"/api/rules/{rule['id']}",
            json={
                "name": "Scene sunrise",
                "target_type": "scene",
                "target_id": scene["id"],
                "rule_type": "astronomical",
                "timezone": "Asia/Qyzylorda",
                "days_of_week_mask": 127,
                "payload_json": {
                    "action": "run_scene",
                    "solar_event": "sunrise",
                    "offset_minutes": 15,
                    "lat": 43.2389,
                    "lon": 76.8897,
                },
            },
        )
        assert update.status_code == 200
        updated = update.json()
        assert updated["name"] == "Scene sunrise"
        assert updated["target_type"] == "scene"
        assert updated["target_id"] == scene["id"]
        assert updated["rule_type"] == "astronomical"
        assert updated["payload_json"]["action"] == "run_scene"
    finally:
        restore_temp_database(db_path, originals)
