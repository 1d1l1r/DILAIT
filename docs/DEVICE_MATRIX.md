# DEVICE MATRIX

| Display name | Advertised name | Family | App family | Windows tested | macOS tested | Power | Brightness | RGB | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Mock Strip Alpha | Mock Strip Alpha | mock | internal simulator | yes | yes | yes | yes | yes | Development simulator |
| Validation ELK-BLEDOM | ELK-BLEDOM | ELK-BLEDOM / duoCo-style | duoCo Strip | yes | no | yes | yes | yes | Real BLE scan and onboarding validated on Windows on 2026-04-17. GATT service `fff0`, write char `fff3`, read char `fff4`, observed write handle `8`. Manual on/off, brightness, RGB, recurring-rule execution, and astronomical-rule execution all returned success through the app stack. |
| Nearby ELK-BLEDOM0B | ELK-BLEDOM0B | likely ELK-BLEDOM | unknown | discovered only | no | unknown | unknown | unknown | Detected during live scan, not yet onboarded. |
| Nearby BJ_LED | BJ_LED | BJ_LED family | unknown | discovered only | no | unknown | unknown | unknown | Discovery confirmed during Sprint 2 work, driver intentionally not started in this sprint. |
