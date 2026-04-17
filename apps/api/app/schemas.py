from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from apps.api.app.models import ActionType, DeviceFamily, RuleType, RunStatus, TargetType


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RoomCreate(APIModel):
    name: str
    sort_order: int = 0


class RoomUpdate(APIModel):
    name: str | None = None
    sort_order: int | None = None


class RoomRead(APIModel):
    id: int
    name: str
    sort_order: int


class DeviceCreate(APIModel):
    name: str
    family: DeviceFamily = DeviceFamily.MOCK
    ble_identifier: str
    ble_address: str | None = None
    vendor_name: str | None = None
    room_id: int | None = None
    is_enabled: bool = True
    meta_json: dict[str, Any] = Field(default_factory=dict)


class DeviceUpdate(APIModel):
    name: str | None = None
    family: DeviceFamily | None = None
    room_id: int | None = None
    is_enabled: bool | None = None


class DeviceRead(APIModel):
    id: int
    name: str
    family: DeviceFamily
    ble_identifier: str
    ble_address: str | None
    vendor_name: str | None
    room_id: int | None
    is_enabled: bool
    capabilities_json: dict[str, Any]
    meta_json: dict[str, Any]
    desired_state_json: dict[str, Any]
    known_state_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime | None


class BrightnessRequest(APIModel):
    value: int = Field(ge=0, le=100)


class ColorRequest(APIModel):
    r: int = Field(ge=0, le=255)
    g: int = Field(ge=0, le=255)
    b: int = Field(ge=0, le=255)


class GroupCreate(APIModel):
    name: str
    room_id: int | None = None


class GroupUpdate(APIModel):
    name: str | None = None
    room_id: int | None = None


class GroupRead(APIModel):
    id: int
    name: str
    room_id: int | None
    created_at: datetime
    devices: list[DeviceRead] = Field(default_factory=list)


class GroupDeviceAttach(APIModel):
    device_id: int


class SceneCreate(APIModel):
    name: str
    room_id: int | None = None
    is_enabled: bool = True


class SceneUpdate(APIModel):
    name: str | None = None
    room_id: int | None = None
    is_enabled: bool | None = None


class SceneActionCreate(APIModel):
    target_type: TargetType
    target_id: int
    action_type: ActionType
    action_payload_json: dict[str, Any] = Field(default_factory=dict)
    sort_order: int = 0


class SceneActionRead(APIModel):
    id: int
    scene_id: int
    target_type: TargetType
    target_id: int
    action_type: ActionType
    action_payload_json: dict[str, Any]
    sort_order: int


class SceneRead(APIModel):
    id: int
    name: str
    room_id: int | None
    is_enabled: bool
    created_at: datetime
    actions: list[SceneActionRead] = Field(default_factory=list)


class RuleCreate(APIModel):
    name: str
    target_type: TargetType
    target_id: int
    rule_type: RuleType
    is_enabled: bool = True
    timezone: str = "Asia/Qyzylorda"
    days_of_week_mask: int = 127
    start_date: datetime | None = None
    end_date: datetime | None = None
    payload_json: dict[str, Any] = Field(default_factory=dict)


class RuleUpdate(APIModel):
    name: str | None = None
    is_enabled: bool | None = None
    timezone: str | None = None
    days_of_week_mask: int | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    payload_json: dict[str, Any] | None = None


class RuleRead(APIModel):
    id: int
    name: str
    target_type: TargetType
    target_id: int
    rule_type: RuleType
    is_enabled: bool
    timezone: str
    days_of_week_mask: int
    start_date: datetime | None
    end_date: datetime | None
    payload_json: dict[str, Any]
    next_run_at: datetime | None
    last_run_at: datetime | None
    created_at: datetime
    updated_at: datetime | None


class RuleRunRead(APIModel):
    id: int
    rule_id: int
    planned_at: datetime
    executed_at: datetime | None
    status: RunStatus
    error_text: str | None
    details_json: dict[str, Any]


class DiscoveryCandidateRead(APIModel):
    family: str
    name: str
    ble_identifier: str
    vendor_name: str | None
    rssi: int | None
    services: list[str] = Field(default_factory=list)


class DashboardRead(APIModel):
    devices_total: int
    groups_total: int
    scenes_total: int
    enabled_rules_total: int
    upcoming_rules: list[RuleRead]
    recent_failures: list[RuleRunRead]


class SystemInfoRead(APIModel):
    app_name: str
    timezone: str
    database_url: str
    supported_families: list[str]

