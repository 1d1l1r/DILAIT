# PLAN

## Current sprint

Sprint 1 is implemented as the current foundation:

- FastAPI backend with SQLite persistence
- mock driver for device actions and discovery
- groups, scenes, and schedule rule CRUD
- recurring, once, delay, and astronomical next-run calculation
- background scheduler with execution history
- mobile-first browser UI served by the backend

## Sprint 2 status

Sprint 2 foundation is now implemented and validated on Windows for the first production path:

- real BLE discovery via Bleak
- ELK-BLEDOM / duoCo-style classification
- first production ELK-BLEDOM driver
- onboarding from discovery into saved devices
- live command execution through API and scheduler on a real ELK-BLEDOM device

## Sprint 3 status

Sprint 3 is now implemented and validated on Windows for the second production BLE family:

- ZENGGE / Surplife discovery classification for LEDnetWF-style devices
- first production ZENGGE-family driver for the validated LEDnetWF `product_id 0x33` controller path
- onboarding from discovery into saved devices without breaking the existing ELK-BLEDOM path
- live command execution through API and scheduler on a real `LEDnetWF02003348BC6C` device
- recurring and astronomical rules both executed successfully on the real ZENGGE-family device

## Sprint 4 status

Sprint 4 is now implemented and validated on Windows for the third production BLE family:

- BJ_LED / MohuanLED discovery classification for the validated `BJ_LED` advertising path
- first production BJ/Mohuan driver for the confirmed `eea0 / ee01 / ee02` profile
- onboarding from discovery into saved devices without breaking the existing ELK-BLEDOM and ZENGGE paths
- live command execution through API and scheduler on a real `BJ_LED` device
- recurring and astronomical rules both executed successfully on the real BJ-family device
- all three core families now have one verified end-to-end production path in the current architecture

## Sprint 5 status

Sprint 5 is now implemented and validated on Windows for practical mixed control on top of the three working BLE families:

- groups now support mixed membership across ELK-BLEDOM, ZENGGE / Surplife, BJ_LED / MohuanLED, and mock devices
- scene actions now target devices and groups through the same shared action engine used by direct control and scheduler runs
- group and scene execution now aggregate per-device failures so one failing device does not block the rest of the mixed action flow
- tokenized local action links are implemented through `GET /a/{token}` with immediate and confirmation-first modes
- mobile-friendly confirmation, success, partial-success, and failure pages now exist for action-link usage from iPhone or future NFC tags
- integration tests now run against an isolated temporary SQLite database instead of the live local hub database
- live mixed validation succeeded with a real BJ device and a real ZENGGE-family device through:
  - direct single-device actions
  - one mixed-family group action
  - one mixed-family scene
  - one action-link-triggered scene run
  - one scheduler rule targeting the mixed group

## Next implementation slices

1. Add safer scene/group editing polish and better inline visibility for partial failures in the UI.
2. Expand discovery heuristics for additional adjacent variants only when backed by real hardware validation.
3. Add NFC-ready usage patterns on top of the now-stable local action-link entrypoint without adding cloud dependence.
4. Improve state feedback where families expose reliable notification or readback paths.
