@echo off
setlocal

cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo Python virtual environment not found at .venv\Scripts\python.exe
    echo Create it first with:
    echo   py -3 -m venv .venv
    echo   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
    exit /b 1
)

if "%DILIAT_HOST%"=="" set DILIAT_HOST=0.0.0.0
if "%DILIAT_PORT%"=="" set DILIAT_PORT=8000

echo Starting DILIAT on http://%DILIAT_HOST%:%DILIAT_PORT%
".venv\Scripts\python.exe" -m uvicorn apps.api.app.main:app --host %DILIAT_HOST% --port %DILIAT_PORT%
