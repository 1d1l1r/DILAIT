# PLAN

## Current sprint

Sprint 1 is implemented as the current foundation:

- FastAPI backend with SQLite persistence
- mock driver for device actions and discovery
- groups, scenes, and schedule rule CRUD
- recurring, once, delay, and astronomical next-run calculation
- background scheduler with execution history
- mobile-first browser UI served by the backend

## Next implementation slices

1. Replace mock driver registry entries with real BLE family drivers one by one.
2. Add richer discovery heuristics and manual family confirmation UI.
3. Expand action-links and NFC entrypoints on top of the shared action execution layer.
4. Polish mixed-family group and scene flows.

