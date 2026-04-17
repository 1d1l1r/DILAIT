# DEVICE MATRIX

| Display name | Advertised name | Family | App family | Windows tested | macOS tested | Power | Brightness | RGB | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Mock Strip Alpha | Mock Strip Alpha | mock | internal simulator | yes | yes | yes | yes | yes | Development simulator |
| Validation ELK-BLEDOM | ELK-BLEDOM | ELK-BLEDOM / duoCo-style | duoCo Strip | yes | no | yes | yes | yes | Real BLE scan and onboarding validated on Windows on 2026-04-17. GATT service `fff0`, write char `fff3`, read char `fff4`, observed write handle `8`. Manual on/off, brightness, RGB, recurring-rule execution, and astronomical-rule execution all returned success through the app stack. |
| Desk ZENGGE Validation | LEDnetWF02003348BC6C | ZENGGE / Surplife family | ZENGGE | yes | no | yes | yes | yes | Real Sprint 3 validation target on Windows on 2026-04-17. Manufacturer data `0x5a02` parsed as BLE v5, product_id `0x33`. GATT services `fe00` + `ffff`, write char `ff01`, notify/read char `ff02`, observed write handle `22`. Discovery, onboarding, manual on/off, brightness, RGB, recurring-rule execution, and astronomical-rule execution all returned success through the app stack. Validation rules were disabled after the run to avoid surprise triggers. |
| Nearby ELK-BLEDOM0B | ELK-BLEDOM0B | likely ELK-BLEDOM | unknown | discovered only | no | unknown | unknown | unknown | Detected during live scan, not yet onboarded. |
| Nearby LEDnetWF02003338FA1F | LEDnetWF02003338FA1F | likely ZENGGE / Surplife | unknown | discovered only | no | unknown | unknown | unknown | Discovery and GATT inspection matched the same `ff01/ff02` LEDnetWF shape as the validated unit, but this specific device was not onboarded in Sprint 3. |
| Nearby BJ_LED | BJ_LED | BJ_LED family | unknown | discovered only | no | unknown | unknown | unknown | Discovery confirmed during Sprint 2 work, driver intentionally not started in this sprint. |
