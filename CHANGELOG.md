# Changelog

## v0.1.0 - MVP complete

First usable local release of DILIAT.

### Included

- local-first web control for BLE LED devices
- production support for:
  - ELK-BLEDOM / duoCo
  - ZENGGE / Surplife
  - BJ_LED / MohuanLED
- device onboarding from BLE discovery
- rooms
- mixed-family groups
- mixed-family scenes
- schedule rules:
  - delay
  - once
  - recurring
  - astronomical
- action links / NFC-ready tokenized URLs
- human-first mobile UI at `/`
- advanced admin/debug UI at `/advanced`
- scheduler-based background execution
- optimistic-state handling for families without authoritative readback

### Validated

- real-device control confirmed on all three supported families
- mixed-group and mixed-scene execution confirmed
- scheduler path confirmed on real devices
- action-link execution confirmed

### Known limitations

- current BLE families use optimistic state rather than authoritative readback
- local-first only, with no cloud or remote access layer
- no music sync or vendor-specific effects
