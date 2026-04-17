# API

## Core control endpoints

- `POST /api/devices/{device_id}/on`
- `POST /api/devices/{device_id}/off`
- `POST /api/devices/{device_id}/brightness`
- `POST /api/devices/{device_id}/color`
- `POST /api/groups/{group_id}/on`
- `POST /api/groups/{group_id}/off`
- `POST /api/groups/{group_id}/brightness`
- `POST /api/groups/{group_id}/color`
- `POST /api/scenes/{scene_id}/run`

These all execute through the shared action engine. Mixed-family group and scene execution fans out per target device and logs failures without aborting the whole run on the first error.

## Scene management

- `GET /api/scenes`
- `POST /api/scenes`
- `PATCH /api/scenes/{scene_id}`
- `DELETE /api/scenes/{scene_id}`
- `POST /api/scenes/{scene_id}/actions`
- `DELETE /api/scenes/{scene_id}/actions/{action_id}`

Scene actions support:

- `target_type`: `device` or `group`
- `action_type`: `on`, `off`, `brightness`, `color`

Scenes intentionally reuse the same device/group action engine that powers direct control, scheduler runs, and action links.

## Action links

- `GET /api/action-links`
- `POST /api/action-links`
- `PATCH /api/action-links/{action_link_id}`
- `DELETE /api/action-links/{action_link_id}`
- `GET /a/{token}`

Action-link fields:

- `name`
- `token`
- `target_type`: `device`, `group`, or `scene`
- `target_id`
- `action_type`: `on`, `off`, `toggle`, or `run_scene`
- `is_enabled`
- `requires_confirmation`

Behavior:

- scene targets must use `run_scene`
- device/group targets support `on`, `off`, and `toggle`
- opening `GET /a/{token}` executes immediately when confirmation is disabled
- when confirmation is enabled, the first open renders a confirmation page and `?confirm=1` performs the action
- pages are local-first HTML responses intended for mobile browser and NFC-tag use

## Scheduler notes

Scheduler rules still target `device`, `group`, or `scene`.

When a mixed group or mixed scene run has partial failures:

- successful sub-actions still run
- the failure is preserved in rule-run details under `details_json.execution`
- the top-level run status becomes `failed` when any sub-action fails

This keeps scheduler history honest while preserving best-effort execution across multiple devices.
