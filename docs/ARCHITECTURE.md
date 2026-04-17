# ARCHITECTURE

## Runtime shape

The current foundation keeps BLE execution server-side and serves a thin local web UI from the same FastAPI process.

```text
Browser
  -> FastAPI app
  -> service layer
  -> scheduler / action executor
  -> driver registry
  -> BLE drivers (mock today, real families next)
```

## Main decisions

- The scheduler is a background async loop inside the backend process so rules continue running while the browser is closed.
- All manual actions, scene actions, and scheduled executions converge in `execute_target_action`, which keeps the future NFC and action-link layer unblocked.
- The initial UI is intentionally dependency-light for faster MVP progress on the current machine, while the API shape stays compatible with a future dedicated frontend.

