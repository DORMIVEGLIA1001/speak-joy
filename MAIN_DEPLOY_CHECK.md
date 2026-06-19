# Main Deploy Check

## FE main
- `origin/main` da nhan merge moi:
  - `8cd8881 merge: dev into main`
  - `8c8bd0d feat: improve SpeakJoy history and auth entrypoints`
  - `0f79adb feat: call recording upload, theme fixes, auth drawer encoding fix`
- Thay doi lon da vao `main`:
  - Google auth button va redirect flow trong frontend
  - SpeakJoy history, transcript preview, recording upload flow
  - UI/UX cap nhat cho call prep, auth, dashboard
  - Dockerfile frontend toi uu theo huong `npm ci` + cache build

## FE pipeline/deploy
- File CI: [fe/.gitlab-ci.yml](E:\test\speak joy\fe\.gitlab-ci.yml)
- Pipeline chi deploy khi branch la `main`
- Build:
  - `npm ci`
  - ghi `ENV_CONFIG` vao `.env.production`
  - `npm run build`
- Deploy:
  - rsync `.next/standalone`, `.next/static`, `public`
  - ghi `.env.production` len server
  - restart PM2 app `speak-joy-fe`
- Diem can chu y:
  - `DEPLOY_PORT` hien tai trong file la `3006`
  - neu production reverse proxy dang tro vao `3000` thi frontend public co the khong an ban moi dung cach mong muon

## BE main
- `origin/main` da nhan merge moi:
  - `ca1b0ce merge: dev into main`
  - `0da9fc4 feat: add oauth groundwork and persist SpeakJoy history`
  - `3b95cb1 feat: recordings API, session model update, supabase storage`
  - `baf12ba feat: speakjoy ws, word-info API, auth improvements`
- Thay doi lon da vao `main`:
  - nen tang social auth/OAuth cho Google/Facebook
  - luu session SpeakJoy, transcript va recordings
  - recordings upload/history voi Supabase Storage
  - nang cap realtime SpeakJoy va auth/session API

## BE pipeline/deploy
- File CI: [be/.gitlab-ci.yml](E:\test\speak joy\be\.gitlab-ci.yml)
- Validate:
  - `python -m compileall app ai_service`
- Deploy khi branch la `main`
- Deploy script:
  - rsync source len server
  - ghi `.env`
  - `docker build -f source/Dockerfile.fastapi -t speak-joy-be:latest source`
  - chay migration bang `python -m be.app.db.migrate`
  - chay container `speak-joy-be` tren `127.0.0.1:8080:8000`
- Environment URL:
  - `https://api-speak-joy.chainz.tech`

## Production/public check
- Frontend public:
  - `https://speak-joy.chainz.tech/` tra ve HTTP `200`
- Backend public:
  - `https://api-speak-joy.chainz.tech/health` tra ve `{"status":"ok","service":"be-python"}`
- Ket luan:
  - production public dang len va backend health OK
  - tuy nhien, tu ben ngoai khong the khang dinh chac 100% frontend public dang phuc vu dung ban moi nhat neu khong doi chieu them pipeline log, PM2 process, hoac mot dau hieu version cu the tren giao dien

## Local public check
- Khong xac nhan duoc local public stack hien tai
- Ly do:
  - `docker compose ps` tra ve `Docker Desktop is unable to start`
- Nghia la Docker daemon local hien khong san sang, nen khong the xac nhan local public co dang chay dung ban moi hay khong

## Tong ket ngan
- Ca `fe/main` va `be/main` deu da nhan cac thay doi lon tu `dev`
- Ca hai repo deu co pipeline/deploy tren `main`
- Backend public dang song va frontend public dang phan hoi
- Diem rui ro lon nhat con lai la `fe` deploy port `3006` va viec chua co xac nhan truc tiep tu pipeline log/server process cho frontend production
