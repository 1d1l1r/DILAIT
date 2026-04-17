from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from astral import LocationInfo
from astral.sun import sun
from sqlalchemy import select

from apps.api.app.core import async_session_factory, settings
from apps.api.app.models import RuleRun, RuleType, RunStatus, ScheduleRule


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _rule_timezone(rule: ScheduleRule) -> ZoneInfo:
    return ZoneInfo(rule.timezone or settings.default_timezone)


def _matches_day(mask: int, current_date: date) -> bool:
    return bool(mask & (1 << current_date.weekday()))


def _within_window(rule: ScheduleRule, candidate_utc: datetime) -> bool:
    if rule.start_date and candidate_utc < _ensure_utc(rule.start_date):
        return False
    if rule.end_date and candidate_utc > _ensure_utc(rule.end_date):
        return False
    return True


def _parse_local_time(raw_value: str) -> time:
    pieces = [int(part) for part in raw_value.split(":")]
    if len(pieces) == 2:
        pieces.append(0)
    return time(*pieces)


def _solar_event_at(current_date: date, timezone: ZoneInfo, event_name: str, lat: float, lon: float) -> datetime:
    location = LocationInfo(latitude=lat, longitude=lon, timezone=timezone.key)
    events = sun(location.observer, date=current_date, tzinfo=timezone)
    return events[event_name]


def calculate_next_run(rule: ScheduleRule, now: datetime | None = None) -> datetime | None:
    now_utc = _ensure_utc(now or datetime.now(UTC))
    payload = rule.payload_json or {}

    if not rule.is_enabled:
        return None

    if rule.rule_type == RuleType.DELAY:
        if rule.last_run_at is not None:
            return None
        if rule.next_run_at and _ensure_utc(rule.next_run_at) > now_utc:
            return _ensure_utc(rule.next_run_at)
        delay_seconds = int(payload.get("delay_seconds", 0))
        base = _ensure_utc(rule.created_at or now_utc)
        candidate = base + timedelta(seconds=delay_seconds)
        return candidate if candidate >= now_utc else None

    if rule.rule_type == RuleType.ONCE:
        run_at_raw = payload.get("run_at")
        if not run_at_raw:
            return None
        candidate = _ensure_utc(datetime.fromisoformat(run_at_raw))
        return candidate if candidate >= now_utc and _within_window(rule, candidate) else None

    timezone = _rule_timezone(rule)
    local_now = now_utc.astimezone(timezone)
    mask = rule.days_of_week_mask or 127

    if rule.rule_type == RuleType.RECURRING:
        trigger_time = _parse_local_time(payload.get("time", "00:00:00"))
        for day_offset in range(0, 14):
            current_date = local_now.date() + timedelta(days=day_offset)
            if not _matches_day(mask, current_date):
                continue
            candidate_local = datetime.combine(current_date, trigger_time, tzinfo=timezone)
            candidate_utc = candidate_local.astimezone(UTC)
            if candidate_utc >= now_utc and _within_window(rule, candidate_utc):
                return candidate_utc
        return None

    if rule.rule_type == RuleType.ASTRONOMICAL:
        event_name = payload.get("solar_event", "sunset")
        offset_minutes = int(payload.get("offset_minutes", 0))
        lat = float(payload["lat"])
        lon = float(payload["lon"])
        for day_offset in range(0, 14):
            current_date = local_now.date() + timedelta(days=day_offset)
            if not _matches_day(mask, current_date):
                continue
            candidate_local = _solar_event_at(current_date, timezone, event_name, lat, lon) + timedelta(minutes=offset_minutes)
            candidate_utc = candidate_local.astimezone(UTC)
            if candidate_utc >= now_utc and _within_window(rule, candidate_utc):
                return candidate_utc
        return None

    return None


@dataclass(slots=True)
class RuleExecutor:
    session_factory: object

    async def run_once(self) -> None:
        async with self.session_factory() as session:
            result = await session.execute(
                select(ScheduleRule)
                .where(ScheduleRule.is_enabled.is_(True), ScheduleRule.next_run_at.is_not(None), ScheduleRule.next_run_at <= datetime.now(UTC))
                .order_by(ScheduleRule.next_run_at, ScheduleRule.created_at)
            )
            rules = result.scalars().all()
            for rule in rules:
                await self._execute_rule(session, rule)
            await session.commit()

    async def _execute_rule(self, session, rule: ScheduleRule) -> None:
        from apps.api.app.services import execute_target_action

        planned_at = _ensure_utc(rule.next_run_at or datetime.now(UTC))
        run = RuleRun(
            rule_id=rule.id,
            planned_at=planned_at,
            status=RunStatus.SKIPPED,
            details_json={"target_type": rule.target_type.value, "target_id": rule.target_id},
        )
        session.add(run)

        retries = 2
        last_error: str | None = None
        for attempt in range(retries):
            try:
                payload = rule.payload_json or {}
                action_name = payload.get("action", "run_scene" if rule.target_type.value == "scene" else "on")
                await execute_target_action(
                    session=session,
                    target_type=rule.target_type,
                    target_id=rule.target_id,
                    action_name=action_name,
                    payload=payload,
                )
                run.status = RunStatus.SUCCESS
                run.executed_at = datetime.now(UTC)
                run.details_json = {**run.details_json, "attempt": attempt + 1, "action": action_name}
                last_error = None
                break
            except Exception as exc:  # noqa: BLE001
                last_error = str(exc)
                await asyncio.sleep(0)

        if last_error:
            run.status = RunStatus.FAILED
            run.executed_at = datetime.now(UTC)
            run.error_text = last_error

        rule.last_run_at = datetime.now(UTC)
        rule.next_run_at = calculate_next_run(rule, now=datetime.now(UTC) + timedelta(seconds=1))
        if rule.rule_type in {RuleType.DELAY, RuleType.ONCE} and rule.next_run_at is None:
            rule.is_enabled = False


class SchedulerEngine:
    def __init__(self, poll_seconds: float = 1.0) -> None:
        self.poll_seconds = poll_seconds
        self._task: asyncio.Task[None] | None = None
        self._executor = RuleExecutor(async_session_factory)

    async def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        finally:
            self._task = None

    async def _loop(self) -> None:
        while True:
            await self._executor.run_once()
            await asyncio.sleep(self.poll_seconds)

