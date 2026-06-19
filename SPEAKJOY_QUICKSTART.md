# SpeakJoy Real-Time Quick Start Guide

## 🚀 Quick Start (5 Minutes)

### Step 1: Start Backend Server

```bash
# Navigate to backend directory
cd be

# Start the server
uvicorn ai_service.app:app --reload --host 0.0.0.0 --port 8000
```

**Expected Output:**
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

### Step 2: Start Frontend Server

```bash
# Open a new terminal
# Navigate to frontend directory
cd fe

# Start the development server
npm run dev
```

**Expected Output:**
```
  ▲ Next.js 14.x.x
  - Local:        http://localhost:3000
  - Network:      http://192.168.x.x:3000

 ✓ Ready in 2.5s
```

### Step 3: Open the Application

1. Open your browser
2. Navigate to: `http://localhost:3000/SpeakJoy`
3. You should see the SpeakJoy interface with Bingo the fox

### Step 4: Start a Conversation

1. **Click the phone button** (☎️) in the center
2. **Allow microphone access** when prompted
3. **Wait for "Đang gọi"** status to appear
4. **Speak clearly:** "Hello, how are you?"
5. **Watch the magic happen:**
   - Your speech appears in blue (partial transcript)
   - Bot thinks (yellow status)
   - Bot responds (streaming text)
   - Bot speaks (green status, audio plays)

### Step 5: End the Call

Click the **"← TRỞ VỀ"** button in the top-left corner

## ✅ Verification Checklist

After following the quick start:

- [ ] Backend server is running on port 8000
- [ ] Frontend server is running on port 3000
- [ ] Browser opens to SpeakJoy page
- [ ] Phone button is visible and clickable
- [ ] Microphone permission is granted
- [ ] WebSocket connects successfully
- [ ] Speech is recognized
- [ ] Bot responds with text and audio
- [ ] Call can be ended cleanly

## 🔧 Troubleshooting

### Backend won't start
```bash
# Check if port 8000 is already in use
netstat -ano | findstr :8000

# Kill the process if needed (Windows)
taskkill /PID <process_id> /F

# Or use a different port
uvicorn ai_service.app:app --reload --port 8001
```

### Frontend won't start
```bash
# Clear node modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Or use a different port
npm run dev -- -p 3001
```

### Microphone not working
1. Check browser permissions (chrome://settings/content/microphone)
2. Try a different browser
3. Check system microphone settings
4. Verify microphone is not muted

### WebSocket connection fails
1. Verify backend is running
2. Check WebSocket URL in `fe/hooks/useSpeakJoyCall.ts`
3. Check CORS settings in backend
4. Try refreshing the page

### No audio playback
1. Check browser audio is not muted
2. Verify TTS provider is configured
3. Check TTS API keys in `.env`
4. Check browser console for errors

## 📋 Environment Variables

Make sure these are set in `be/.env`:

```env
# ASR Provider (choose one)
ASR_PROVIDER=comfyui
# or
ASR_PROVIDER=dashscope
ASR_API_KEY=your_dashscope_key

# TTS Provider (choose one)
TTS_PROVIDER=comfyui
# or
TTS_PROVIDER=dashscope
TTS_API_KEY=your_dashscope_key

# LLM Provider
AI_PROVIDER=gemini
AI_API_KEY=your_gemini_key

# ComfyUI (if using)
COMFYUI_URL=http://localhost:8188
```

## 🎯 Next Steps

Once the quick start works:

1. **Read the full testing guide:** `SPEAKJOY_REALTIME_TESTING.md`
2. **Review the implementation:** `SPEAKJOY_IMPLEMENTATION_SUMMARY.md`
3. **Test edge cases:** Try different scenarios
4. **Customize the experience:** Modify prompts, voices, etc.

## 💡 Tips

- **Speak clearly** and at a normal pace
- **Wait for the bot** to finish speaking before responding
- **Use headphones** to prevent echo
- **Check the console** (F12) for detailed logs
- **Try different phrases** to test conversation flow

## 🆘 Getting Help

If you encounter issues:

1. Check browser console (F12) for errors
2. Check backend terminal for logs
3. Review the testing guide
4. Check the implementation summary
5. Verify all dependencies are installed

## 🎉 Success!

If you can have a conversation with Bingo, congratulations! The system is working correctly.

Try these conversation starters:
- "Hello, how are you?"
- "What's your name?"
- "Can you help me learn English?"
- "Tell me about animals"
- "Let's play a game!"

---

**Happy Testing! 🚀**
