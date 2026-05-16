# Deploy On Mac Mini

This guide keeps deployment simple and local-first. The goal is to run DILIAT as a home hub on a Mac mini that stays on the same local network as your phone and BLE devices.

## Recommended runtime

- Python virtual environment on the Mac mini
- FastAPI app served by `uvicorn`
- bind to `0.0.0.0:8000` for local network access from a phone
- optional `launchd` auto-start for restart recovery

## 1. Copy or clone the project

Clone the repository or copy your current working tree onto the Mac mini.

If you already have a validated Windows setup and want to keep your devices, rooms, scenes, and schedules, also copy the SQLite database:

- from: `data/lights_hub.db` on the Windows repo
- to: `data/lights_hub.db` on the Mac mini repo

Stop the app before copying the database.

## 2. Create the Python environment

```bash
cd /path/to/DILAIT
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

## 3. Start the app

### Recommended helper script

```bash
chmod +x run_mac.sh
./run_mac.sh
```

### Manual command

```bash
.venv/bin/python -m uvicorn apps.api.app.main:app --host 0.0.0.0 --port 8000
```

Recommended bind:

- host: `0.0.0.0`
- port: `8000`

This keeps the app reachable from other devices on the same Wi-Fi network.

## 4. Open from a phone

Find the Mac mini LAN IP address and open:

- `http://<mac-mini-ip>:8000/`
- `http://<mac-mini-ip>:8000/advanced`

If the page does not load from the phone:

- make sure the Mac mini and phone are on the same local network
- check macOS firewall settings
- confirm the server is bound to `0.0.0.0`

## 5. BLE runtime notes on macOS

macOS uses CoreBluetooth under Bleak. In local testing, discovery and onboarding can work even when repeated command writes become unstable after the first physical command. The runtime now treats each command as an isolated BLE session:

- resolve the current device through Bleak
- connect
- discover services/characteristics
- write the validated packet
- explicitly disconnect

On macOS only, a failed write gets bounded retries after a short reconnect delay. Each retry uses a fresh client/session. For CoreBluetooth UUID identifiers, the runtime first tries direct connect to avoid an unnecessary scan; if CoreBluetooth reports the device as not found, it performs one scanner lookup and retries against the scanned peripheral object.

ZENGGE-family controllers may require notifications to be enabled on `ff02` before writing to `ff01`, and macOS uses response writes when the characteristic advertises `write`. BJ_LED/MohuanLED controllers write to the observed `ee01` handle without notifications; because this is a write-without-response path, macOS leaves a short flush delay before disconnecting and paces repeated commands to the same device. First command latency may be higher when macOS has to refresh CoreBluetooth's peripheral cache.

Useful logs to inspect when a Mac mini stops controlling a physical light:

- `BLE find_device start/hit/miss`
- `BLE write connect start/ok`
- `BLE write characteristic resolved`
- `BLE notify start/stop ok`
- `BLE write ok`
- `BLE write direct connect miss`
- `BLE write attempt failed`
- `BLE write disconnect ok/failed`

If the API returns a BLE failure, treat it as a real command failure. The app should not update optimistic device state when connect, service discovery, or write fails.

Manual smoke for one nearby real device:

1. start the app without restarting between commands
2. use one already-onboarded device
3. run: off -> wait -> on -> wait -> color -> wait -> off -> on
4. confirm the physical light reacts every time
5. check logs for reconnects or write failures

## 6. Optional environment variables

DILIAT can read simple process environment variables:

- `DILIAT_APP_NAME`
- `DILIAT_DEFAULT_TIMEZONE`
- `DILIAT_DATABASE_URL`
- `DILIAT_SCHEDULER_POLL_SECONDS`
- `DILIAT_BLE_SCAN_TIMEOUT_SECONDS`
- `DILIAT_BLE_CONNECT_TIMEOUT_SECONDS`
- `DILIAT_HOST`
- `DILIAT_PORT`

See the root `.env.example` for a reference list. The app does not auto-load `.env`; set values in your shell or service definition if needed.

## 7. Basic persistence and backup

Default database location:

- `<repo>/data/lights_hub.db`

Simple backup recommendation:

1. stop the app
2. copy `data/lights_hub.db`
3. store dated snapshots somewhere safe

That is enough for MVP use. There is no separate backup subsystem yet.

## 8. Optional auto-start with launchd

A sample plist is included here:

- [infra/macmini/local.diliat.hub.plist.example](C:\Users\ilyad\OneDrive\Develop\DILAIT\infra\macmini\local.diliat.hub.plist.example)

Before using it:

1. replace `__REPO_DIR__` with the real absolute path on the Mac mini
2. create a `logs/` directory inside the repo if you want the sample log paths to work
3. copy the file to `~/Library/LaunchAgents/`
4. load it with `launchctl load ~/Library/LaunchAgents/local.diliat.hub.plist`

This is intentionally a simple next step, not a full deployment framework.
