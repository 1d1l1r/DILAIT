# DILIAT

Local-first BLE lights hub for home use.

DILIAT is a FastAPI + SQLite app for controlling BLE LED controllers from a phone on the same Wi-Fi network. It includes a human-first mobile UI at `/`, an admin/debug panel at `/advanced`, mixed-family groups and scenes, schedules, and tokenized local action links for shortcuts or NFC tags.

## MVP status

Recommended release: `v0.1.0`

Validated baseline:

- real-device control for:
  - ELK-BLEDOM / duoCo
  - ZENGGE / Surplife
  - BJ_LED / MohuanLED
- device onboarding from BLE discovery
- rooms
- mixed-family groups
- mixed-family scenes
- schedules:
  - delay
  - once
  - recurring
  - astronomical
- action links / NFC-ready tokenized URLs
- human-first mobile UI at `/`
- admin/debug UI at `/advanced`

## Routes

- `/` - human-first everyday control UI
- `/advanced` - engineering/admin/debug UI
- `/api/...` - JSON API used by both UIs
- `/a/{token}` - local action-link trigger URL

## Windows quick start

### Recommended startup path

1. Open PowerShell in the project root.
2. Create the virtual environment once:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

3. Start the app with the helper script:

```powershell
.\run_dev.bat
```

This starts Uvicorn on `0.0.0.0:8000` by default so the app is reachable from your phone on the same Wi-Fi network.

### Manual startup command

```powershell
.\.venv\Scripts\python.exe -m uvicorn apps.api.app.main:app --host 0.0.0.0 --port 8000
```

### Open it

- On the same PC: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- On your phone on the same Wi-Fi: `http://<windows-ip>:8000`

If phone access is blocked, allow TCP port `8000` through Windows Firewall.

## Mac mini quick start

### Recommended startup path

1. Clone or copy the repository onto the Mac mini.
2. Create the virtual environment and install dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

3. Start the app:

```bash
chmod +x run_mac.sh
./run_mac.sh
```

### Manual startup command

```bash
.venv/bin/python -m uvicorn apps.api.app.main:app --host 0.0.0.0 --port 8000
```

### Phone access on local Wi-Fi

Open `http://<mac-mini-ip>:8000` from an iPhone or another device on the same local network.

For a practical production-like setup on the Mac mini, see [docs/DEPLOY_MACMINI.md](C:\Users\ilyad\OneDrive\Develop\DILAIT\docs\DEPLOY_MACMINI.md).

## Config

The app works with defaults, but it can read process environment variables for simple machine-specific setup:

- `DILIAT_APP_NAME`
- `DILIAT_DEFAULT_TIMEZONE`
- `DILIAT_DATABASE_URL`
- `DILIAT_SCHEDULER_POLL_SECONDS`
- `DILIAT_BLE_SCAN_TIMEOUT_SECONDS`
- `DILIAT_BLE_CONNECT_TIMEOUT_SECONDS`
- `DILIAT_HOST` and `DILIAT_PORT` for the helper startup scripts

See [.env.example](C:\Users\ilyad\OneDrive\Develop\DILAIT\.env.example) for a reference template. The app does not auto-load `.env` files on its own; use those values in your shell, service, or launch configuration.

## Data and backups

Default SQLite database location:

- `<repo>/data/lights_hub.db`

On this current Windows workspace that is:

- `C:\Users\ilyad\OneDrive\Develop\DILAIT\data\lights_hub.db`

Recommended basic backup flow:

1. Stop the app.
2. Copy `data/lights_hub.db` to a safe backup file.
3. Optionally keep dated snapshots such as `lights_hub.2026-04-19.bak`.

To move your hub state from Windows to a Mac mini:

1. Stop the app on both machines.
2. Copy `data/lights_hub.db` from the Windows repo to the Mac mini repo's `data/` directory.
3. Start the Mac mini app again.

## Known limitations

- state is still optimistic for current BLE families; the UI reflects commanded state, not authoritative hardware readback
- local-first only; there is no cloud or remote access layer
- family support is intentionally limited to validated controller paths
- BLE behavior still depends on the host machine's Bluetooth hardware, permissions, and radio range

## Release note summary

`v0.1.0` is the first usable local MVP release of DILIAT.

Highlights:

- 3 validated BLE families working end-to-end
- mixed-family groups and scenes
- schedules and background execution
- action links for shortcuts and future NFC use
- human-first mobile UI plus preserved `/advanced` panel

See [CHANGELOG.md](C:\Users\ilyad\OneDrive\Develop\DILAIT\CHANGELOG.md) for the release summary.
