# DEPLOY ON MAC MINI

## Expected runtime

- Python virtual environment on the Mac mini
- FastAPI app running via `uvicorn`
- optional Caddy in front for a stable local hostname
- launchd service for restart recovery

## Planned deployment flow

1. Clone the repository onto the Mac mini.
2. Create `.venv` and install `requirements.txt`.
3. Start the service with `uvicorn apps.api.app.main:app --host 0.0.0.0 --port 8000`.
4. Wire launchd and optional Caddy after real BLE drivers are validated on macOS.

