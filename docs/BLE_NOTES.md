# BLE NOTES

## Sprint 2 findings

- Real BLE scanning is now implemented via `BleakScanner.discover(..., return_adv=True)`.
- Nearby devices were successfully discovered on Windows, including multiple `ELK-BLEDOM` units and one `BJ_LED`.
- The first validated production target was an advertised device named `ELK-BLEDOM` at `BE:59:91:00:0A:5C`.

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

## Limitations and quirks

- Live state readback is still optimistic in our app layer; we are not relying on notifications for authoritative state yet.
- Visual confirmation of each command still depends on observing the physical strip; the terminal validation confirms successful BLE writes and successful scheduler execution records.
- `BJ_LED` devices are now visible in discovery, but remain intentionally unsupported in Sprint 2.
