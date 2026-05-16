# BLE NOTES

## Sprint 2 findings

- Real BLE scanning is now implemented via `BleakScanner.discover(..., return_adv=True)`.
- Nearby devices were successfully discovered on Windows, including multiple `ELK-BLEDOM` units and one `BJ_LED`.
- The first validated production target was an advertised device named `ELK-BLEDOM` at `BE:59:91:00:0A:5C`.

## Sprint 3 findings

- The first validated ZENGGE-family production target was advertised as `LEDnetWF02003348BC6C` at `E4:98:BB:48:BC:6C`.
- Discovery classification now identifies this family from:
  - advertised names such as `LEDnetWF...`
  - ZENGGE-style manufacturer payloads such as `0x5a02`
  - LEDnetWF GATT service/characteristic hints such as `ffff`, `ff01`, and `ff02`
- The validated unit exposed metadata consistent with LEDnetWF BLE v5:
  - manufacturer payload: `5405e498bb48bc6c0033200a0110246123014d0000000a000f0000`
  - parsed `product_id`: `0x33`
  - parsed BLE version: `5`
  - parsed firmware version byte: `0x20`
  - parsed LED hardware version byte: `0x0a`

## Sprint 4 findings

- The first validated BJ_LED-family production target was advertised as `BJ_LED` at `23:01:01:6C:15:81`.
- Discovery classification now identifies this family from:
  - advertised names such as `BJ_LED`
  - validated GATT service/characteristic hints such as `eea0`, `ee01`, and `ee02`
- The validated BJ device exposed the following live GATT shape on Windows:
  - service `0000eea0-0000-1000-8000-00805f9b34fb`
  - characteristic `0000ee01-0000-1000-8000-00805f9b34fb` write-without-response/read/notify, observed handle `5`
  - characteristic `0000ee02-0000-1000-8000-00805f9b34fb` write/write-without-response/read, observed handle `7`
- Readback from both `ee01` and `ee02` returned the same fixed 20-byte test pattern and did not reflect live light state changes.

## Sprint 5 mixed execution findings

- Mixed-family validation was performed on Windows on 2026-04-18 with:
  - `BJ_LED` at `23:01:01:6C:15:81`
  - `LEDnetWF02003338FA1F` at `E4:98:BB:38:FA:1F`
- Direct single-device actions for both participating devices still executed successfully after the mixed-family/action-link changes.
- A mixed-family group containing those two devices executed a real `color` action successfully.
- A mixed-family scene targeting:
  - the mixed group with `color`
  - the BJ device with `off`
  executed successfully through the shared scene engine.
- A local action link targeting that scene via `GET /a/{token}` executed successfully and returned the human-readable success page.
- A delay rule targeting the mixed group executed successfully after the Sprint 5 changes, which confirmed scheduler compatibility with the new mixed-action execution path.

## ZENGGE / Surplife validated GATT shape

- Services observed on the validated device:
  - `00001800-0000-1000-8000-00805f9b34fb`
  - `00001801-0000-1000-8000-00805f9b34fb`
  - `0000fe00-0000-1000-8000-00805f9b34fb`
  - `0000ffff-0000-1000-8000-00805f9b34fb`
- Characteristics observed:
  - `00002a00-0000-1000-8000-00805f9b34fb`
  - `00002a01-0000-1000-8000-00805f9b34fb`
  - `00002a04-0000-1000-8000-00805f9b34fb`
  - `00002a05-0000-1000-8000-00805f9b34fb`
  - `0000ff01-0000-1000-8000-00805f9b34fb` write
  - `0000ff02-0000-1000-8000-00805f9b34fb` read/notify
  - `0000ff11-0000-1000-8000-00805f9b34fb`
  - `0000ff22-0000-1000-8000-00805f9b34fb`
- Actual write handle seen on the validated device: `22`

## Working ZENGGE command notes

- Verified power-on packet:
  - `00 01 80 00 00 0d 0e 0b 3b 23 00 00 00 00 00 00 00 32 00 00 90`
- Verified power-off packet:
  - `00 04 80 00 00 0d 0e 0b 3b 24 00 00 00 00 00 00 00 32 00 00 91`
- Verified RGB packet for solid red:
  - `00 02 80 00 00 09 0a 0b 31 ff 00 00 00 00 f0 0f 2f`
- Verified brightness packet for `30%`:
  - `00 03 80 00 00 0d 0e 0b 3b 01 00 00 1e 00 1e 00 00 00 00 00 78`
- These packets were confirmed on the real device by seeing manufacturer advertisement state mutate after each write:
  - color write changed the RGB bytes in the advertising payload
  - brightness write reduced the advertised red channel from `ff` to `4d`
  - power-off write changed the power byte from `0x23` to `0x24`

## BJ_LED / MohuanLED validated GATT shape

- Services observed on the validated device:
  - `00001800-0000-1000-8000-00805f9b34fb`
  - `0000eea0-0000-1000-8000-00805f9b34fb`
- Characteristics observed:
  - `00002a00-0000-1000-8000-00805f9b34fb`
  - `0000ee01-0000-1000-8000-00805f9b34fb` write-without-response/read/notify
  - `0000ee02-0000-1000-8000-00805f9b34fb` write/write-without-response/read
- Actual write handle seen on the validated device: `5`
- Notifications on `ee01` were not usable on Windows during validation: enabling notify returned `Protocol Error 0x03: Write Not Permitted`.

## Working BJ_LED command notes

- Verified power-on packet:
  - `69 96 06 01 01`
- Verified power-off packet:
  - `69 96 02 01 00`
- Verified RGB packet for solid red:
  - `69 96 05 02 ff 00 00 ff`
- Verified brightness behavior:
  - there is no separate brightness opcode in the validated profile
  - brightness is implemented by scaling RGB channels before sending the color packet
  - example verified `30%` red payload:
    `69 96 05 02 4c 00 00 4c`
- The fourth color byte is the white/max channel used by the upstream BJ_LED/MohuanLED command shape.

## ELK-BLEDOM validated GATT shape

- Services observed on the validated device:
  - `00001800-0000-1000-8000-00805f9b34fb`
  - `0000fff0-0000-1000-8000-00805f9b34fb`
- Characteristics observed:
  - `00002a00-0000-1000-8000-00805f9b34fb`
  - `0000fff3-0000-1000-8000-00805f9b34fb` write
  - `0000fff4-0000-1000-8000-00805f9b34fb` read/notify
- Actual write handle seen on the validated device: `8`
- Important quirk: some community integrations key off handle `13`, but the validated Windows device worked with the generic `ELK-BLEDOM` profile and write handle `8`.

## Working command notes

- Power on command that executed successfully on the validated device:
  - `7e 00 04 f0 00 01 ff 00 ef`
- Power off command that executed successfully:
  - `7e 00 04 00 00 00 ff 00 ef`
- Brightness command template that executed successfully:
  - `7e 00 01 ii 00 00 00 00 ef`
  - `ii` is brightness percent `0..100`
- RGB command template that executed successfully:
  - `7e 00 05 03 rr gg bb 00 ef`

## Verified through the app stack

- Discovery -> onboarding -> saved device control path worked on Windows on 2026-04-17.
- `POST /api/devices` successfully probed and stored BLE metadata for the real device.
- Manual actions succeeded without BLE errors:
  - on
  - off
  - brightness
  - color
- Scheduler path also succeeded on the real device:
  - one recurring rule run logged `success`
  - one astronomical rule run logged `success`
- Discovery -> onboarding -> saved device control also worked for the validated `LEDnetWF02003348BC6C` ZENGGE-family controller on Windows on 2026-04-17.
- `POST /api/devices` for the ZENGGE-family target stored:
  - `driver_profile = zengge_lednetwf_0x33_v5`
  - `product_id = 0x33`
  - `ble_version = 5`
  - `write_uuid = ff01`
  - `read_uuid = ff02`
- Manual ZENGGE-family actions succeeded without BLE errors:
  - on
  - off
  - brightness `30%`
  - RGB `(255, 0, 0)`
- Scheduler path also succeeded on the validated ZENGGE-family device:
  - recurring rule executed `brightness`
  - astronomical rule executed `color`
  - both runs logged `success`
- Discovery -> onboarding -> saved device control also worked for the validated `BJ_LED` MohuanLED-family controller on Windows on 2026-04-17.
- `POST /api/devices` for the BJ target stored:
  - `driver_profile = bj_led_mohuan_v1`
  - `protocol_hint = mohuanled`
  - `write_uuid = ee01`
  - `state_mode = optimistic`
- Manual BJ-family actions succeeded without BLE errors:
  - on
  - off
  - brightness `30%`
  - RGB `(255, 0, 0)`
- Scheduler path also succeeded on the validated BJ-family device:
  - recurring rule executed `brightness`
  - astronomical rule executed `color`
  - both runs logged `success`

## Limitations and quirks

- Live state readback is still optimistic in our app layer; we are not relying on notifications for authoritative state yet.
- Visual confirmation of each command still depends on observing the physical strip; the terminal validation confirms successful BLE writes and successful scheduler execution records.
- DILAIT-006 macOS stabilization makes command writes more conservative on Mac mini/CoreBluetooth: one command per fresh Bleak client session, explicit disconnect after every attempt, detailed connect/service/write/disconnect timing logs, and bounded clean-reconnect retries on macOS if a write fails.
- On macOS, CoreBluetooth UUIDs are attempted directly first; if direct connect reports the device as not found, the write path performs one scanner lookup and reconnects to the scanned peripheral object. This keeps normal commands fast while recovering from stale CoreBluetooth cache misses seen with BJ_LED devices.
- ZENGGE-family controllers that expose `ff01`/`ff02` enable notify on `ff02` before writes and use response writes when `ff01` advertises `write`. This was required for the `IOTBTF53` / product `0x6400` path tested on Mac mini.
- BJ_LED/MohuanLED uses `write-without-response` on `ee01`, so the macOS path waits briefly after the write before disconnecting and enforces a short per-device pacing gap before the next no-response write. Without that pacing, rapid UI clicks can queue commands that the physical controller applies later as a stale burst.
- BLE connect, service discovery, and write failures are surfaced as command failures. The app should not mark optimistic state as updated when the physical write path raises an error.
- Sprint 3 initially supported the verified LEDnetWF `product_id 0x33` control path. DILAIT-006 also adds the Mac-tested `IOTBT...` / `product_id 0x6400` / BLE v35 ZENGGE path.
- `JTX-RGB` remained visible nearby with service `2022`, but it was not pulled into Sprint 3 because it did not match the validated LEDnetWF command path.
- BJ/Mohuan currently uses optimistic state only. The validated hardware did not provide authoritative notification/readback, and direct reads from `ee01`/`ee02` returned a static test-pattern buffer rather than live state.
- Sprint 4 intentionally supports one verified BJ/Mohuan profile first: advertised `BJ_LED` with `eea0 / ee01 / ee02`.
- One onboarding edge case was fixed during Sprint 4: if the user assigned a custom device name before creation, probe had to prefer the live advertised name from the scan result over the custom name so profile selection would still lock onto the validated BJ family.
- Sprint 5 did not reveal any new family-specific packet quirks. Mixed execution still reuses the exact validated per-family commands from the underlying device drivers.
- In mixed-family runs, optimistic-state families still remain optimistic. Group, scene, and rule summaries reflect execution success/failure per target, but they do not upgrade BJ/ZENGGE/ELK to authoritative readback.
