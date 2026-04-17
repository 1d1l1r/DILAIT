# UPD — additional scope clarifications

Important: scheduling/timers are part of MVP, including unlimited rules, weekday selection, and astronomical timers. Also keep the architecture extensible for future NFC/URL-triggered actions.

Please include the following requirements in the implementation scope:

## 1. Schedules / timers

Timers are a core MVP feature, not an optional extra.

Requirements:
- unlimited number of schedule rules
- rules can target a device, a group, or a scene
- support weekdays / weekends / custom day selection
- support these rule types:
  - delay
  - once
  - recurring
  - astronomical
- astronomical timers must support sunrise and sunset with minute offsets
- rules must continue working server-side even when no browser is open
- each rule should expose next run preview and execution history

## 2. Astronomical timers

Astronomical timers are important for real use and should be included in MVP if feasible.

Requirements:
- support sunrise and sunset based triggers
- support offsets like -30 / +15 minutes
- support weekday/weekend/custom day filtering
- use configured location (lat/lon + timezone)

## 3. Action links / NFC triggers

The system should be designed so that actions can later be triggered by URL links, NFC tags, QR codes, Shortcuts, and local automations.

Please prepare the architecture for:
- tokenized action links
- links targeting device / group / scene
- actions such as:
  - on
  - off
  - toggle
  - run_scene
- server endpoint like `/a/{token}` or equivalent
- optional confirmation mode
- reusable action execution layer, so UI actions, timers, scenes, and NFC links all use the same action engine

This does not need to be fully implemented in the first sprint, but the architecture should not block it.

---

# Lights Hub — Implementation Brief

## 1. Goal

Build a **local-first web hub** for controlling home BLE LED devices from multiple Chinese controller families through **one interface**.

The system must:
- work inside the local network
- open from iPhone in a browser
- execute BLE control **on the host**, not in the browser
- support multiple device families through drivers
- provide proper **timers/schedules**, including **astronomical timers**

---

## 2. Target setup

### Development
- **Windows**
- local backend/frontend development
- mock drivers for UI/API/scheduler
- BLE testing on Windows when possible

### Production
- **Mac mini**
- always-on service running at home
- Mac mini acts as BLE gateway
- iPhone opens the local web UI

---

## 3. Supported device families

### Family A
- **duoCo Strip**
- **ELK-BLEDOM**

### Family B
- **ZENGGE**
- **Surplife**

### Family C
- **MohuanLED**
- devices named **BJ_LED**

---

## 4. MVP scope

### Device control
- BLE scan
- add device into the system
- detect device family
- manual family override
- on/off
- brightness
- RGB color
- room assignment

### Groups
- create groups
- add devices to groups
- group actions

### Scenes
- create scene
- save action sets
- run scene manually

### Timers / schedules
- **unlimited number of rules**
- rules can target:
  - device
  - group
  - scene
- weekday/weekend/custom day selection
- enable/disable rule
- execution history

### Rule types
- **delay** — after N minutes/seconds
- **once** — specific date/time
- **recurring** — weekdays and time
- **astronomical** — sunrise/sunset with offset

---

## 5. Out of MVP scope

- music sync modes
- vendor-specific built-in effects if unstable
- cloud access
- multi-user auth
- push notifications
- HomeKit/Alexa/Google integration
- geofencing
- presence sensors
- light sensors
- holiday/calendar exceptions

---

## 6. Main architecture

```text
iPhone / browser
      ↓
Local Web UI
      ↓
FastAPI backend
      ↓
Rules / Scheduler / Scene engine
      ↓
Driver layer
      ↓
BLE adapter
      ↓
Physical BLE LED devices
```

---

## 7. Tech stack

## Backend
- **Python 3.12+**
- **FastAPI**
- **SQLAlchemy**
- **SQLite** for MVP
- **Bleak** for BLE
- **APScheduler** or custom scheduler loop
- **Pydantic**

## Frontend
Two acceptable options:

### Option A — simpler
- server-rendered / minimal JS
- HTMX/Alpine or plain JS

### Option B — nicer
- **React + Vite**
- mobile-first UI

For speed:
- if fastest MVP matters — **A**
- if a better long-term UI matters — **B**

Recommended choice: **React + Vite**

## Infra
- Mac mini
- venv
- uvicorn
- optional Caddy reverse proxy
- launchd service on macOS

---

## 8. Architecture principles

### 1. Browser does not touch BLE
BLE exists only on the host.

### 2. Drivers are isolated
Each device family gets its own driver.

### 3. Unified API
UI and scheduler must not know vendor-specific details.

### 4. Scheduler is server-side
Timers keep working even if the browser is closed.

### 5. Device identity is not only MAC-based
Use a universal identifier because macOS BLE identity behaves differently.

### 6. Each scheduled action is an independent rule
Not “one paired on/off timer”, but independent rules.

---

## 9. Repository structure

```text
lights-hub/
  apps/
    api/
      app/
        api/
        core/
        db/
        models/
        schemas/
        services/
        scheduler/
        drivers/
        ble/
        utils/
        main.py
    web/
      src/
      public/
      index.html

  packages/
    shared/
      constants/
      types/

  docs/
    PLAN.md
    ARCHITECTURE.md
    DEVICE_MATRIX.md
    API.md
    BLE_NOTES.md
    DEPLOY_MACMINI.md

  infra/
    macos/
      launchd/
      caddy/

  tests/
    unit/
    integration/
    fixtures/
```

---

## 10. Backend modules

## `drivers/`
Interfaces and family implementations:
- `base.py`
- `driver_elkbledom.py`
- `driver_zengge.py`
- `driver_bj_led.py`
- `driver_mock.py`

## `ble/`
Low-level BLE access:
- `scanner.py`
- `client.py`
- `adapter.py`

## `scheduler/`
- `engine.py`
- `executor.py`
- `solar.py`
- `next_run.py`

## `services/`
- `device_service.py`
- `group_service.py`
- `scene_service.py`
- `rule_service.py`
- `discovery_service.py`

## `models/`
SQLAlchemy models

## `schemas/`
Pydantic request/response models

---

## 11. Driver contract

All drivers must implement a unified interface.

```python
class LightDriver(Protocol):
    family: str

    async def discover_candidates(self) -> list["DriverCandidate"]:
        ...

    async def probe(self, ble_identifier: str) -> "ProbeResult":
        ...

    async def turn_on(self, device: "Device") -> None:
        ...

    async def turn_off(self, device: "Device") -> None:
        ...

    async def set_brightness(self, device: "Device", value: int) -> None:
        ...

    async def set_rgb(self, device: "Device", r: int, g: int, b: int) -> None:
        ...

    async def get_capabilities(self, device: "Device") -> "Capabilities":
        ...
```

### Important
If a family does not support state readback, the driver must still work using an optimistic state model.

---

## 12. Data model

## Table `devices`
- `id`
- `name`
- `family`
- `ble_identifier`
- `ble_address` nullable
- `vendor_name` nullable
- `room_id` nullable
- `is_enabled`
- `last_seen_at`
- `last_rssi`
- `capabilities_json`
- `meta_json`
- `created_at`
- `updated_at`

## Table `rooms`
- `id`
- `name`
- `sort_order`

## Table `groups`
- `id`
- `name`
- `room_id` nullable
- `created_at`

## Table `group_devices`
- `group_id`
- `device_id`

## Table `scenes`
- `id`
- `name`
- `room_id` nullable
- `is_enabled`
- `created_at`

## Table `scene_actions`
- `id`
- `scene_id`
- `target_type` (`device` / `group`)
- `target_id`
- `action_type` (`on` / `off` / `brightness` / `color`)
- `action_payload_json`
- `sort_order`

## Table `schedule_rules`
- `id`
- `name`
- `target_type` (`device` / `group` / `scene`)
- `target_id`
- `rule_type` (`delay` / `once` / `recurring` / `astronomical`)
- `is_enabled`
- `timezone`
- `days_of_week_mask`
- `start_date` nullable
- `end_date` nullable
- `payload_json`
- `next_run_at` nullable
- `last_run_at` nullable
- `created_at`
- `updated_at`

## Table `rule_runs`
- `id`
- `rule_id`
- `planned_at`
- `executed_at` nullable
- `status` (`success` / `failed` / `skipped`)
- `error_text` nullable
- `details_json` nullable

## Table `action_links`
- `id`
- `name`
- `token`
- `target_type` (`device` / `group` / `scene`)
- `target_id`
- `action_type` (`on` / `off` / `toggle` / `run_scene` / `set_brightness` / `set_color`)
- `action_payload_json`
- `is_enabled`
- `requires_confirmation`
- `created_at`
- `updated_at`
- `last_used_at` nullable

---

## 13. Rule payload examples

## Delay
```json
{
  "action": "turn_off",
  "delay_seconds": 1800
}
```

## Once
```json
{
  "action": "turn_on",
  "run_at": "2026-04-17T22:30:00+05:00"
}
```

## Recurring
```json
{
  "action": "set_brightness",
  "time": "07:30:00",
  "brightness": 35
}
```

## Astronomical
```json
{
  "action": "turn_on",
  "solar_event": "sunset",
  "offset_minutes": -20,
  "lat": 43.2389,
  "lon": 76.8897
}
```

---

## 14. Days of week model

Use a bitmask or equivalent representation for:
- Mon
- Tue
- Wed
- Thu
- Fri
- Sat
- Sun

UI presets must support:
- every day
- weekdays
- weekends
- custom

---

## 15. Astronomical timers

Support:
- `sunrise`
- `sunset`

Optional later:
- civil dawn
- civil dusk

### Behavior
- user defines location (coordinates or city-derived location)
- scheduler calculates actual event time
- applies `offset_minutes`
- respects `days_of_week_mask`

### Important
Astronomical rules must also support:
- enable/disable
- unlimited count
- target device/group/scene
- next run preview

---

## 16. Capability model

Every device needs a capability profile:

```json
{
  "power": true,
  "brightness": true,
  "rgb": true,
  "white_channel": false,
  "effects": false,
  "readback_state": false
}
```

UI must hide unsupported controls.

---

## 17. Discovery logic

### Automatic family detection
Use:
- advertised name
- services
- characteristics
- known patterns

### Manual override
User can manually set:
- ELK-BLEDOM
- ZENGGE
- BJ_LED

### Device onboarding
After scan, each candidate must be:
- visible in candidate list
- accept/reject capable
- assignable to a custom name
- assignable to a room
- family-confirmable

---

## 18. API endpoints

## Devices
- `GET /api/devices`
- `POST /api/devices/discover`
- `POST /api/devices`
- `GET /api/devices/{id}`
- `PATCH /api/devices/{id}`
- `DELETE /api/devices/{id}`

## Device actions
- `POST /api/devices/{id}/on`
- `POST /api/devices/{id}/off`
- `POST /api/devices/{id}/brightness`
- `POST /api/devices/{id}/color`

## Rooms
- `GET /api/rooms`
- `POST /api/rooms`
- `PATCH /api/rooms/{id}`
- `DELETE /api/rooms/{id}`

## Groups
- `GET /api/groups`
- `POST /api/groups`
- `PATCH /api/groups/{id}`
- `DELETE /api/groups/{id}`
- `POST /api/groups/{id}/devices`
- `DELETE /api/groups/{id}/devices/{device_id}`
- `POST /api/groups/{id}/on`
- `POST /api/groups/{id}/off`
- `POST /api/groups/{id}/brightness`
- `POST /api/groups/{id}/color`

## Scenes
- `GET /api/scenes`
- `POST /api/scenes`
- `PATCH /api/scenes/{id}`
- `DELETE /api/scenes/{id}`
- `POST /api/scenes/{id}/actions`
- `POST /api/scenes/{id}/run`

## Rules / timers
- `GET /api/rules`
- `POST /api/rules`
- `PATCH /api/rules/{id}`
- `DELETE /api/rules/{id}`
- `POST /api/rules/{id}/enable`
- `POST /api/rules/{id}/disable`
- `GET /api/rules/{id}/runs`
- `GET /api/rules/upcoming`

## Action links / NFC triggers
- `GET /api/action-links`
- `POST /api/action-links`
- `PATCH /api/action-links/{id}`
- `DELETE /api/action-links/{id}`
- `POST /api/action-links/{id}/enable`
- `POST /api/action-links/{id}/disable`
- `GET /a/{token}`

## Health / system
- `GET /api/health`
- `GET /api/system/info`

---

## 19. Frontend pages

## 1. Dashboard
- summary cards
- all devices quick state
- nearest upcoming rules
- last failed executions

## 2. Devices
- list
- filter by room/family
- device card
- power, brightness, color
- assign room
- create timer

## 3. Groups
- create/edit groups
- group actions
- assign devices
- create timer

## 4. Scenes
- create/edit scene
- add actions
- run now
- create timer

## 5. Rules
- full schedule list
- next run
- last run
- enable/disable
- create/edit rule

## 6. Discovery
- scan BLE
- found candidates
- assign family
- save device

## 7. Action links
- create/edit action link
- copy URL
- enable/disable
- optional confirmation flag
- see last used time

---

## 20. Scheduler behavior

### Rules
- scheduler recalculates `next_run_at`
- on service start, restore all active rules
- after each execution, recalculate next run

### Retry
For MVP:
- 1 immediate retry on transient BLE failure
- then log failed

### Conflict policy
If two rules target the same thing at the same time:
- execute by `next_run_at`
- if equal, execute by `created_at`
- no advanced conflict resolution in MVP

---

## 21. Delay timer behavior

Delay rule is a one-shot job:
- created
- receives `next_run_at`
- executes once
- after execution either deleted or marked completed/disabled

Recommended:
- keep the record
- mark executed + disabled

---

## 22. Device state handling

Separate:

### Desired state
What the system wants to apply

### Reported / known state
What the system believes the device state is

This matters because many cheap BLE controllers do not support reliable readback.

---

## 23. Action links / NFC trigger behavior

The system must support a reusable action execution layer so that:
- UI actions
- timer executions
- scene executions
- action links / NFC-triggered calls

all use the same backend action engine.

### Supported action link targets
- device
- group
- scene

### Supported action link actions
- `on`
- `off`
- `toggle`
- `run_scene`

Optional later:
- `set_brightness`
- `set_color`

### Behavior
- NFC tag can contain a URL like `http://lights.local/a/<token>`
- opening the URL triggers the action
- if `requires_confirmation = true`, show a confirmation page first
- if disabled or invalid, show a friendly error page
- if success, show a small success page

---

## 24. Sprint plan

# Sprint 1 — Core foundation

## Scope
- repo scaffold
- FastAPI app
- SQLite schema
- mock driver
- devices/groups/scenes/rules models
- scheduler engine on mock driver
- basic web UI

## Acceptance
- can create a mock device
- can turn mock device on/off
- can create a recurring rule
- can create an astronomical rule
- next run is calculated correctly
- rule execution is logged

---

# Sprint 2 — ELK-BLEDOM driver

## Scope
- BLE discovery pipeline
- driver_elkbledom
- on/off
- brightness
- RGB
- assign real device
- timer execution on real device

## Acceptance
- at least one real ELK-BLEDOM device is discovered
- it can be added to the system
- it can be controlled manually
- recurring and astronomical rules work on it

---

# Sprint 3 — ZENGGE / Surplife driver

## Scope
- driver_zengge
- family detection improvements
- capability handling
- stable connect/write path
- timer support

## Acceptance
- at least one ZENGGE/Surplife device works reliably
- on/off, brightness, RGB work
- timer rules work

---

# Sprint 4 — BJ_LED / MohuanLED driver

## Scope
- driver_bj_led
- discovery support
- command execution
- timer support
- mixed-family validation

## Acceptance
- at least one BJ_LED device works
- base actions work
- timer rules work

---

# Sprint 5 — Polish and mixed control

## Scope
- mixed-family groups
- mixed-family scenes
- mobile UI polish
- discovery UX polish
- better error states
- last-run/upcoming-run views
- action links / NFC trigger support

## Acceptance
- mixed group actions work
- mixed scenes work
- one rule can target group or scene
- mobile UI is usable from iPhone
- action links can trigger device/group/scene actions

---

## 25. Testing strategy

## Unit tests
- next_run calculator
- days_of_week logic
- astronomical calculation
- rule executor
- scene expansion
- capability filtering

## Integration tests
- mock driver API flow
- DB persistence
- scheduler restart recovery

## Manual device validation
For each family:
- power
- brightness
- RGB
- recurring rule
- astronomical rule

---

## 26. Docs to maintain

## `DEVICE_MATRIX.md`
Columns:
- display name
- advertised name
- family
- app family
- tested on Windows
- tested on macOS
- power
- brightness
- RGB
- notes

## `BLE_NOTES.md`
- service UUIDs
- characteristic UUIDs
- packet notes
- pairing quirks
- timing quirks

## `PLAN.md`
- MVP scope
- sprint status
- decisions log

---

## 27. Non-functional requirements

- mobile-first UI
- service must survive restart
- scheduled rules must recover after restart
- logs should be readable by a human
- local-only by default
- no cloud dependency required for MVP

---

## 28. Explicit scope constraints for Codex

### Do
- build only a local-first Lights Hub
- focus on the 3 BLE families
- prioritize stable manual control + scheduler
- keep vendor-specific effects optional
- keep architecture extensible for future action-link/NFC use

### Do not
- do not build a generic smart-home platform
- do not add auth unless required later
- do not add remote internet access
- do not implement music sync first
- do not overengineer event bus/microservices
- do not use Postgres for MVP
- do not build native mobile apps; web only

---

## 29. Recommended first coding order

1. repo scaffold
2. DB models
3. mock driver
4. scheduler core
5. rules CRUD API
6. web UI for rules/devices
7. astronomical calculation
8. BLE discovery abstraction
9. ELK-BLEDOM driver
10. ZENGGE driver
11. BJ_LED driver
12. groups/scenes polish
13. action links / NFC triggers

---

## 30. Definition of done for MVP

MVP is done when:
- the service runs on Mac mini
- it opens from iPhone
- it can control at least one real device from each supported family
- it supports unlimited rules
- it supports weekdays/weekends/custom days
- it supports astronomical rules
- it supports targeting device/group/scene
- rules execute in the background
- execution logs and next-run preview work

---

## 31. One-sentence summary for Codex

Build a local-first web-based BLE lights hub for three known device families (ELK-BLEDOM/duoCo, ZENGGE/Surplife, BJ_LED/MohuanLED) with unified control, groups, scenes, unlimited schedule rules, weekdays/weekends selection, astronomical timers, and an extensible action-link layer for future NFC/URL-triggered control; development happens on Windows and deployment on Mac mini.
