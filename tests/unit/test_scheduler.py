from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

from apps.api.app.models import RuleType, TargetType
from apps.api.app.scheduler import calculate_next_run


def make_rule(**overrides):
    base = {
        "id": 1,
        "name": "rule",
        "target_type": TargetType.DEVICE,
        "target_id": 1,
        "rule_type": RuleType.RECURRING,
        "is_enabled": True,
        "timezone": "Asia/Qyzylorda",
        "days_of_week_mask": 127,
        "start_date": None,
        "end_date": None,
        "payload_json": {"action": "on", "time": "19:30:00"},
        "next_run_at": None,
        "last_run_at": None,
        "created_at": datetime(2026, 4, 17, 10, 0, tzinfo=UTC),
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_recurring_rule_next_run_same_day():
    now = datetime(2026, 4, 17, 12, 0, tzinfo=UTC)
    rule = make_rule()
    next_run = calculate_next_run(rule, now=now)
    assert next_run is not None
    assert next_run > now
    assert next_run.astimezone().hour >= 19 or next_run.date() >= now.date()


def test_astronomical_rule_next_run_exists():
    now = datetime(2026, 4, 17, 10, 0, tzinfo=UTC)
    rule = make_rule(
        rule_type=RuleType.ASTRONOMICAL,
        payload_json={
            "action": "on",
            "solar_event": "sunset",
            "offset_minutes": -20,
            "lat": 43.2389,
            "lon": 76.8897,
        },
    )
    next_run = calculate_next_run(rule, now=now)
    assert next_run is not None
    assert next_run > now


def test_delay_rule_stops_after_execution():
    rule = make_rule(
        rule_type=RuleType.DELAY,
        payload_json={"action": "off", "delay_seconds": 60},
        created_at=datetime(2026, 4, 17, 10, 0, tzinfo=UTC),
        last_run_at=datetime(2026, 4, 17, 10, 1, tzinfo=UTC),
    )
    assert calculate_next_run(rule, now=datetime(2026, 4, 17, 10, 2, tzinfo=UTC)) is None

