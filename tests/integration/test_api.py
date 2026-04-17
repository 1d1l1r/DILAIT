from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from fastapi.testclient import TestClient

from apps.api.app.core import engine, init_db
from apps.api.app.main import app
from apps.api.app.models import Base
from apps.api.app.scheduler import RuleExecutor


def reset_database():
    async def _reset():
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.drop_all)
            await connection.run_sync(Base.metadata.create_all)
        await init_db()

    asyncio.run(_reset())


def test_device_rule_flow():
    reset_database()
    client = TestClient(app)

    device_response = client.post(
        "/api/devices",
        json={
            "name": "Test strip",
            "family": "mock",
            "ble_identifier": "mock://test-strip",
        },
    )
    assert device_response.status_code == 200
    device = device_response.json()
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


def test_group_and_scene_actions():
    reset_database()
    client = TestClient(app)

    device = client.post(
        "/api/devices",
        json={"name": "Group strip", "family": "mock", "ble_identifier": "mock://group-strip"},
    ).json()
    group = client.post("/api/groups", json={"name": "Bedroom"}).json()
    client.post(f"/api/groups/{group['id']}/devices", json={"device_id": device["id"]})

    group_on = client.post(f"/api/groups/{group['id']}/on")
    assert group_on.status_code == 200

    devices = client.get("/api/devices").json()
    assert devices[0]["known_state_json"]["is_on"] is True

    scene = client.post("/api/scenes", json={"name": "Sleep mode"}).json()
    scene_update = client.post(
        f"/api/scenes/{scene['id']}/actions",
        json={
            "target_type": "group",
            "target_id": group["id"],
            "action_type": "off",
            "action_payload_json": {},
        },
    )
    assert scene_update.status_code == 200

    run_scene = client.post(f"/api/scenes/{scene['id']}/run")
    assert run_scene.status_code == 200

    devices_after = client.get("/api/devices").json()
    assert devices_after[0]["known_state_json"]["is_on"] is False


def apply_session_factory():
    from apps.api.app.core import async_session_factory

    return async_session_factory
