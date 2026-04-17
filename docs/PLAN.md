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

## Next implementation slices

1. Add the next real family driver without regressing the now-validated ELK-BLEDOM and ZENGGE paths.
2. Expand discovery heuristics for additional LEDnetWF / IOTBT variants while keeping manual family override.
3. Expand action-links and NFC entrypoints on top of the shared action execution layer.
4. Polish mixed-family group and scene flows.
