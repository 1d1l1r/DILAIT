# DILAIT-006 — Stabilize BLE command execution on macOS

## Status
Accepted on Mac mini; ready for merge

## Version target
`DILAIT v0.1.1 — macOS BLE stabilization`

## Workstream
Integration / Runtime

## Recommended branch
`fix/dilait-006-macos-ble-stabilization`

## Owner / Contributors

Project Owner:
- 1D1L1R

Contributors for this ticket:
- Rein Hard V — architecture, scope lock, review
- Bushid Ronin V — implementation executor

---

## Purpose

DILAIT works correctly on Windows with real BLE LED controllers, but on Mac mini / macOS the app can discover and onboard devices, and may execute one command successfully, after which real lights stop reacting even though API calls keep returning `200 OK`.

After this ticket, DILAIT should have a stable and diagnosable macOS BLE command path for the already-supported device families.

---

## Current state / dependencies

Current accepted state:
- DILAIT MVP is implemented.
- Supported real BLE families:
  - ELK-BLEDOM / duoCo
  - ZENGGE / Surplife
  - BJ_LED / MohuanLED
- Windows runtime path works: devices react to on/off/color commands.
- Mac mini runtime path currently fails in practice:
  - discovery works;
  - onboarding works;
  - first command may work;
  - subsequent commands can return `200 OK` but physical lights do not react.

Known recent setup patch:
- `greenlet==3.2.4` was added to `requirements.txt` for Mac bootstrap.

---

## Scope

### In scope

- Diagnose macOS / CoreBluetooth BLE command lifecycle.
- Add detailed BLE runtime logging around:
  - selected driver/family/profile;
  - device id/name/identifier;
  - connect start/success/failure;
  - service/characteristic discovery;
  - selected write characteristic/handle/UUID;
  - write start/success/failure;
  - disconnect/cleanup;
  - elapsed time;
  - retry attempts.
- Verify whether macOS needs different handling for:
  - reconnect per command;
  - forced disconnect/cleanup after command;
  - stale Bleak client/session;
  - small delay between connect/write/disconnect;
  - retry after disconnect.
- Implement the minimal stabilization needed for macOS.
- Preserve current Windows behavior.
- Preserve existing device family drivers and their verified packet formats.
- Add/update tests where possible for lifecycle/retry/error handling without requiring real BLE hardware.
- Update docs with macOS BLE runtime notes and smoke instructions.

### Out of scope

- Do not add new BLE families.
- Do not add music sync.
- Do not add vendor effects.
- Do not redesign UI.
- Do not change scheduler/product behavior except where needed to surface real BLE failures correctly.
- Do not build installers/packaging in this ticket.
- Do not refactor unrelated frontend/backend areas.
- Do not create release tag.

Future/parked work:
- Installer/app wrapper for Windows/macOS.
- Autostart polish.
- Full packaging pass.
- HomeKit/cloud/remote integrations.

---

## Technical requirements

- Keep driver packet formats unchanged unless real Mac testing proves a driver-specific issue.
- Prefer fixing BLE lifecycle over changing product behavior.
- Avoid fake-success on BLE failure where possible:
  - if BLE write fails, API should surface a meaningful error rather than silently pretending success.
- Keep optimistic state model, but do not use optimistic state to hide command failures.
- If retry is added:
  - keep it bounded;
  - log retry reason;
  - avoid endless loops.
- If macOS-specific path is required:
  - isolate it cleanly in BLE adapter/lifecycle layer;
  - do not scatter platform checks across product services.

---

## User behavior

After this ticket:
- On Mac mini, a user should be able to control one onboarded real device repeatedly without re-adding it or restarting the server.
- Failed BLE operations should produce understandable logs and, where applicable, meaningful API/UI failure state.
- Existing Windows behavior should remain working.

---

## Data / model changes

Expected:
- No required schema/model changes.

Allowed only if clearly justified:
- Adding lightweight runtime metadata/log fields if already consistent with current architecture.

---

## API / contract changes

Expected:
- No new public API endpoints required.

Allowed:
- Improve error response detail for failed BLE command execution if current API already supports failure propagation.

---

## UI / UX requirements

Expected:
- No UI redesign.
- No new screens.

Allowed:
- If command failure already reaches UI, preserve/clarify existing failure display.
- Do not expand UI scope.

---

## README / docs update

Update docs only with truthful current-state notes:
- Mac mini BLE runtime notes.
- Recommended smoke path for macOS.
- Known CoreBluetooth/Bleak quirks if confirmed.

README may say:
- Mac mini is supported after this fix if real smoke passes.

README must not claim:
- all BLE controllers are universally supported;
- authoritative readback exists;
- macOS path is fully proven across all devices if only one/few devices were tested.

---

## Tests

Required automated checks:
- `python -m pytest`

Add tests if feasible for:
- BLE lifecycle error propagation;
- retry behavior;
- command failure does not silently become success;
- existing families still route correctly.

If real BLE cannot be automated:
- document manual smoke clearly.

---

## Manual smoke

Run on Mac mini with one physical device powered and near the host.

### Smoke A — one-device repeat command path

1. Start server on Mac mini.
2. Open `/`.
3. Use one already-onboarded real device or onboard exactly one device.
4. Run:
   - `off`
   - wait 2–3 seconds
   - `on`
   - wait 2–3 seconds
   - set one color
   - wait 2–3 seconds
   - `off`
   - `on`
5. Do not re-add the device.
6. Do not restart server during the sequence.

Expected:
- Physical light reacts each time.
- Logs show connect/write/cleanup lifecycle.
- No fake `200 OK` masking actual BLE failure.

### Smoke B — regression sanity

If available, test at least one device from:
- ELK-BLEDOM / duoCo
- ZENGGE / Surplife
- BJ_LED / MohuanLED

Expected:
- No family path obviously regresses.

---

## Acceptance checklist

- [x] Scope matches this ticket.
- [x] No new product features added.
- [x] No UI redesign.
- [x] BLE lifecycle logging is sufficient to diagnose Mac failures.
- [x] Mac mini one-device repeat command smoke passes.
- [x] Existing Windows behavior is not intentionally changed.
- [x] Tests pass.
- [x] Docs updated with truthful Mac runtime notes.
- [x] `requirements.txt` includes required Mac bootstrap dependency.
- [x] Git branch/commit report is provided.
- [x] No release tag created.

---

## Verification commands

```bash
python -m pytest

Mac runtime smoke:

./run_mac.sh

Then open:

http://127.0.0.1:8000/
http://<mac-mini-ip>:8000/
Git / GitHub expectations
Branch: fix/dilait-006-macos-ble-stabilization
Do not commit directly to main unless explicitly approved.
Before commit, run:
git status
git diff
git diff --cached
Stage only intended files.
Do not stage/commit/push DI-CODE reference docs.
Report:
branch;
commit hash;
changed files;
checks;
manual smoke result;
push state.
Implementation guard
Implement only this ticket.
Do not add new BLE families.
Do not redesign UI.
Do not add packaging/installers.
Do not refactor unrelated areas.
Preserve verified packet formats unless real Mac testing proves they are wrong.
Focus on macOS BLE lifecycle stability and observability.
If a command returns success while physical BLE write failed, fix failure propagation instead of hiding it.
Run required checks and report results.
Expected result summary

After this ticket:

Mac mini BLE command execution is stable enough for repeated control of at least one real device.
Logs clearly show BLE lifecycle.
BLE failures are visible rather than hidden behind fake success.
Existing Windows path remains intact.

Still not implemented after this ticket:

Native installers.
App wrappers.
Autostart polish beyond existing release-prep docs.
New device families.
