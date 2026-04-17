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

## Limitations and quirks

- Live state readback is still optimistic in our app layer; we are not relying on notifications for authoritative state yet.
- Visual confirmation of each command still depends on observing the physical strip; the terminal validation confirms successful BLE writes and successful scheduler execution records.
- Sprint 3 intentionally supports the verified LEDnetWF `product_id 0x33` control path first. Other ZENGGE-family variants such as `IOTBT...` remain discoverable but not yet treated as production-supported.
- `JTX-RGB` remained visible nearby with service `2022`, but it was not pulled into Sprint 3 because it did not match the validated LEDnetWF command path.
- `BJ_LED` devices are now visible in discovery, but remain intentionally unsupported in Sprint 2.
