@echo off
setlocal

echo Starting local Speak Joy services...

set "ROOT=E:\test\speak joy"
set "FRONTEND_URL=http://localhost:3005"

start "Speak Joy Backend" cmd /k "cd /d %ROOT% && set CORS_ORIGINS=%FRONTEND_URL%,http://127.0.0.1:3005,http://localhost:3000,http://127.0.0.1:3000 && set FRONTEND_BASE_URL=%FRONTEND_URL% && set GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/google/callback && .\.venv\Scripts\python.exe -m uvicorn be.app.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir be"

start "Speak Joy Frontend" cmd /k "cd /d %ROOT%\fe && set PORT=3005 && npm run dev -- --port 3005"

echo.
echo Local services started in separate windows:
echo   - Backend:  http://localhost:8000
echo   - Frontend: http://localhost:3005
echo.
echo SpeakJoy AI is mounted under /api/ai on the main backend.

endlocal
