from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class DeviceFamily(StrEnum):
    MOCK = "mock"
    ELK_BLEDOM = "ELK-BLEDOM"
    DUOCO_STRIP = "duoCo Strip"
    ZENGGE = "ZENGGE"
    SURPLIFE = "Surplife"
    MOHUANLED = "MohuanLED"
    BJ_LED = "BJ_LED"


class TargetType(StrEnum):
    DEVICE = "device"
    GROUP = "group"
    SCENE = "scene"


class RuleType(StrEnum):
    DELAY = "delay"
    ONCE = "once"
    RECURRING = "recurring"
    ASTRONOMICAL = "astronomical"


class ActionType(StrEnum):
    ON = "on"
    OFF = "off"
    TOGGLE = "toggle"
    RUN_SCENE = "run_scene"
    BRIGHTNESS = "brightness"
    COLOR = "color"


class RunStatus(StrEnum):
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    devices: Mapped[list["Device"]] = relationship(back_populates="room")
    groups: Mapped[list["Group"]] = relationship(back_populates="room")
    scenes: Mapped[list["Scene"]] = relationship(back_populates="room")


class GroupDevice(Base):
    __tablename__ = "group_devices"

    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id", ondelete="CASCADE"), primary_key=True)


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    family: Mapped[DeviceFamily] = mapped_column(Enum(DeviceFamily, native_enum=False))
    ble_identifier: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    ble_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    vendor_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    room_id: Mapped[int | None] = mapped_column(ForeignKey("rooms.id"), nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_rssi: Mapped[int | None] = mapped_column(Integer, nullable=True)
    capabilities_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    meta_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    desired_state_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    known_state_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    room: Mapped[Room | None] = relationship(back_populates="devices")
    groups: Mapped[list["Group"]] = relationship(secondary="group_devices", back_populates="devices")


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    room_id: Mapped[int | None] = mapped_column(ForeignKey("rooms.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    room: Mapped[Room | None] = relationship(back_populates="groups")
    devices: Mapped[list[Device]] = relationship(secondary="group_devices", back_populates="groups")


class Scene(Base):
    __tablename__ = "scenes"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    room_id: Mapped[int | None] = mapped_column(ForeignKey("rooms.id"), nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    room: Mapped[Room | None] = relationship(back_populates="scenes")
    actions: Mapped[list["SceneAction"]] = relationship(
        back_populates="scene",
        cascade="all, delete-orphan",
        order_by="SceneAction.sort_order",
    )


class SceneAction(Base):
    __tablename__ = "scene_actions"

    id: Mapped[int] = mapped_column(primary_key=True)
    scene_id: Mapped[int] = mapped_column(ForeignKey("scenes.id", ondelete="CASCADE"))
    target_type: Mapped[TargetType] = mapped_column(Enum(TargetType, native_enum=False))
    target_id: Mapped[int] = mapped_column(Integer)
    action_type: Mapped[ActionType] = mapped_column(Enum(ActionType, native_enum=False))
    action_payload_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    scene: Mapped[Scene] = relationship(back_populates="actions")


class ScheduleRule(Base):
    __tablename__ = "schedule_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    target_type: Mapped[TargetType] = mapped_column(Enum(TargetType, native_enum=False))
    target_id: Mapped[int] = mapped_column(Integer)
    rule_type: Mapped[RuleType] = mapped_column(Enum(RuleType, native_enum=False))
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    timezone: Mapped[str] = mapped_column(String(120), default="UTC")
    days_of_week_mask: Mapped[int] = mapped_column(Integer, default=127)
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    runs: Mapped[list["RuleRun"]] = relationship(
        back_populates="rule",
        cascade="all, delete-orphan",
        order_by="desc(RuleRun.planned_at)",
    )


class RuleRun(Base):
    __tablename__ = "rule_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    rule_id: Mapped[int] = mapped_column(ForeignKey("schedule_rules.id", ondelete="CASCADE"), index=True)
    planned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[RunStatus] = mapped_column(Enum(RunStatus, native_enum=False))
    error_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    details_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    rule: Mapped[ScheduleRule] = relationship(back_populates="runs")


class ActionLink(Base):
    __tablename__ = "action_links"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    token: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    target_type: Mapped[TargetType] = mapped_column(Enum(TargetType, native_enum=False))
    target_id: Mapped[int] = mapped_column(Integer)
    action_type: Mapped[ActionType] = mapped_column(Enum(ActionType, native_enum=False))
    action_payload_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    requires_confirmation: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

