@echo off
setlocal

echo Starting local Speak Joy services...

set "ROOT=E:\test\speak joy"
set "FRONTEND_URL=http://localhost:3006"

start "Speak Joy Backend" cmd /k "cd /d %ROOT% && set ENABLE_BACKEND_AI=1 && set CORS_ORIGINS=%FRONTEND_URL%,http://127.0.0.1:3006 && set FRONTEND_BASE_URL=%FRONTEND_URL% && set GOOGLE_REDIRECT_URI=%FRONTEND_URL%/api/auth/google/callback && set FACEBOOK_REDIRECT_URI=%FRONTEND_URL%/api/auth/facebook/callback && .\.venv\Scripts\python.exe -m uvicorn be.app.main:app --host 0.0.0.0 --port 8081 --reload --reload-dir be"

@REM start "Speak Joy TTS" cmd /k "cd /d %ROOT%\VieNeu-TTS && start-web-stream.bat"

start "Speak Joy Frontend" cmd /k "cd /d %ROOT%\fe && set DISABLE_HMR=false&& set PORT=3006&& set BACKEND_BASE_URL=http://127.0.0.1:8081&& npm run dev"

echo.
echo Local services started in separate windows:
echo   - Backend:  http://localhost:8081
echo   - Frontend: http://localhost:3006
echo.
echo SpeakJoy AI is mounted under /api/ai on the main backend.

endlocal
