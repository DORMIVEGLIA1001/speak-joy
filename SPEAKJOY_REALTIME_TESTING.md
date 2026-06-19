# SpeakJoy Real-Time Conversation Testing Guide

## Overview

This document provides a comprehensive guide for testing the SpeakJoy real-time conversation system with WebSocket-based voice interaction.

## Prerequisites

### Backend Requirements
- Python 3.11+
- FastAPI server running
- ASR provider configured (ComfyUI or DashScope)
- TTS provider configured (ComfyUI or DashScope)
- LLM provider configured (Gemini, OpenAI, Claude, or Qwen)

### Frontend Requirements
- Node.js 18+
- Next.js development server running
- Modern browser with WebSocket support
- Microphone access permission

## Setup Instructions

### 1. Backend Setup

```bash
cd be

# Install dependencies (if not already installed)
pip install -r requirements.txt

# Configure environment variables in .env
# Required variables:
# - ASR_PROVIDER=comfyui or dashscope
# - TTS_PROVIDER=comfyui or dashscope
# - AI_PROVIDER=gemini (or openai, claude, qwen)
# - AI_API_KEY=your_api_key
# - COMFYUI_URL=http://localhost:8188 (if using ComfyUI)

# Start the backend server
uvicorn ai_service.app:app --reload --host 0.0.0.0 --port 8000
```

### 2. Frontend Setup

```bash
cd fe

# Install dependencies (if not already installed)
npm install

# Start the development server
npm run dev
```

### 3. Access the Application

Open your browser and navigate to:
```
http://localhost:3000/SpeakJoy
```

## Testing Checklist

### Phase 1: Connection Testing

- [ ] **WebSocket Connection**
  - Click the phone button (☎️)
  - Verify loading spinner appears
  - Check browser console for "[SpeakJoy] WebSocket connected"
  - Verify "Đang gọi" (Calling) status appears in header

- [ ] **Microphone Permission**
  - Browser should prompt for microphone access
  - Grant permission
  - Verify no error messages appear
  - Check that activity status shows "🎤 Đang nghe..." (Listening)

### Phase 2: Voice Interaction Testing

- [ ] **Speech Recognition (ASR)**
  - Speak clearly into the microphone: "Hello, how are you?"
  - Verify partial transcript appears in blue bubble while speaking
  - Verify final transcript appears as user message (right side, blue)
  - Check browser console for ASR transcript logs

- [ ] **LLM Response Generation**
  - After speaking, verify status changes to "🤔 Đang suy nghĩ..." (Thinking)
  - Watch for streaming text to appear below the avatar
  - Verify text streams word-by-word with blinking cursor
  - Verify final response appears as assistant message (left side, purple)

- [ ] **Text-to-Speech (TTS)**
  - Verify status changes to "💬 Đang nói..." (Speaking)
  - Verify audio plays automatically
  - Check that audio matches the text response
  - Verify status returns to "Sẵn sàng" (Ready) after audio finishes

### Phase 3: UI/UX Testing

- [ ] **Avatar Animation**
  - Verify avatar is large (256px) initially
  - Verify avatar shrinks to 128px after first message
  - Verify smooth transition animation
  - Verify avatar bounces during speaking

- [ ] **Activity Status Badge**
  - Listening: Blue border, blue dot, "🎤 Đang nghe..."
  - Thinking: Yellow border, yellow dot, "🤔 Đang suy nghĩ..."
  - Speaking: Green border, green dot, "💬 Đang nói..."
  - Idle: Gray border, gray dot, "Sẵn sàng"

- [ ] **Suggestion Buttons**
  - Wait 3 seconds without speaking
  - Verify 5 suggestion buttons appear
  - Verify suggestions are non-clickable (display only)
  - Verify suggestions disappear when bot speaks

- [ ] **Chat Messages**
  - User messages: Right side, blue background
  - Assistant messages: Left side, purple background
  - Verify messages scroll automatically
  - Verify chat area expands when avatar shrinks

- [ ] **Call Duration Timer**
  - Verify timer starts at 00:00
  - Verify timer increments every second
  - Verify timer format: MM:SS

### Phase 4: Error Handling Testing

- [ ] **Microphone Errors**
  - Deny microphone permission
  - Verify error message appears: "Microphone access denied..."
  - Verify call doesn't start
  - Grant permission and try again

- [ ] **Short Audio**
  - Speak for less than 0.5 seconds
  - Verify error: "Recording too short..."
  - Verify error appears in red banner at top

- [ ] **No Speech Detected**
  - Click to speak but remain silent
  - Verify error: "No clear speech detected..."
  - Verify error appears in red banner

- [ ] **WebSocket Disconnection**
  - Stop the backend server while in a call
  - Verify connection closes gracefully
  - Verify status returns to idle
  - Restart server and try reconnecting

- [ ] **Network Errors**
  - Disconnect internet during call
  - Verify error handling
  - Reconnect and verify recovery

### Phase 5: Multi-Turn Conversation Testing

- [ ] **Conversation Flow**
  - Start a call
  - Have a 5-turn conversation:
    1. "Hello, how are you?"
    2. "What's your name?"
    3. "Can you help me learn English?"
    4. "Tell me about animals"
    5. "Thank you!"
  - Verify all turns complete successfully
  - Verify message history is maintained
  - Verify context is preserved across turns

- [ ] **Rapid Speech**
  - Speak immediately after bot finishes
  - Verify system handles quick turn-taking
  - Verify no messages are lost

- [ ] **Long Pauses**
  - Wait 10 seconds between turns
  - Verify system remains responsive
  - Verify suggestions appear after 3 seconds

### Phase 6: End Call Testing

- [ ] **Normal End**
  - Click "← TRỞ VỀ" button
  - Verify call ends immediately
  - Verify messages are cleared
  - Verify status returns to idle
  - Verify timer resets to 00:00

- [ ] **Cleanup**
  - Verify microphone is released
  - Verify WebSocket connection closes
  - Verify no memory leaks (check browser dev tools)

### Phase 7: Browser Compatibility Testing

Test on multiple browsers:

- [ ] **Chrome/Edge (Chromium)**
  - All features work
  - Audio quality is good
  - No console errors

- [ ] **Firefox**
  - All features work
  - Audio quality is good
  - No console errors

- [ ] **Safari (macOS/iOS)**
  - All features work
  - Audio quality is good
  - No console errors

### Phase 8: Mobile Testing

- [ ] **Mobile Chrome (Android)**
  - Touch interactions work
  - Microphone access works
  - Audio playback works
  - UI is responsive

- [ ] **Mobile Safari (iOS)**
  - Touch interactions work
  - Microphone access works
  - Audio playback works
  - UI is responsive

## Common Issues and Solutions

### Issue: "WebSocket connection error"
**Solution:** 
- Verify backend server is running on port 8000
- Check CORS settings in backend
- Verify WebSocket URL in frontend matches backend

### Issue: "Failed to access microphone"
**Solution:**
- Check browser microphone permissions
- Verify HTTPS (or localhost) for microphone access
- Try a different browser
- Check system microphone settings

### Issue: "Speech recognition failed"
**Solution:**
- Verify ASR provider is configured correctly
- Check ASR API keys in .env
- Verify audio format is supported
- Check backend logs for ASR errors

### Issue: "No audio playback"
**Solution:**
- Verify TTS provider is configured correctly
- Check TTS API keys in .env
- Verify browser audio is not muted
- Check browser console for audio errors

### Issue: "LLM not responding"
**Solution:**
- Verify AI_PROVIDER and AI_API_KEY in .env
- Check API rate limits
- Verify internet connection
- Check backend logs for LLM errors

## Performance Benchmarks

Expected performance metrics:

- **WebSocket Connection**: < 500ms
- **ASR Latency**: 1-3 seconds (depends on provider)
- **LLM First Token**: 500ms - 2 seconds
- **TTS First Chunk**: 1-2 seconds
- **End-to-End Latency**: 3-7 seconds (speech → response audio)

## Logging and Debugging

### Frontend Logs
Open browser console (F12) and look for:
```
[SpeakJoy] WebSocket connected
[useSpeakJoyCall] Ready
[useSpeakJoyCall] Session started
[useSpeakJoyCall] ASR final: <transcript>
[useSpeakJoyCall] LLM started
[useSpeakJoyCall] LLM final: <response>
[useSpeakJoyCall] TTS chunk ready: <index>
```

### Backend Logs
Check terminal running the backend server:
```
[SpeakJoy WS] Client connected
[SpeakJoy WS] Session started for friend
[SpeakJoy WS] ASR transcript: <text> (1.5s)
[SpeakJoy WS] Event streaming error: <if any>
[SpeakJoy WS] Connection closed
```

## Success Criteria

The system is working correctly if:

1. ✅ WebSocket connects successfully
2. ✅ Microphone captures audio
3. ✅ ASR transcribes speech accurately
4. ✅ LLM generates contextual responses
5. ✅ TTS plays audio smoothly
6. ✅ UI updates reflect system state
7. ✅ Errors are handled gracefully
8. ✅ Multi-turn conversations work
9. ✅ Call can be ended cleanly
10. ✅ No memory leaks or crashes

## Next Steps After Testing

Once all tests pass:

1. **Optimize Performance**
   - Reduce ASR latency
   - Implement audio streaming (instead of buffering)
   - Add audio preprocessing (noise reduction)

2. **Enhance Features**
   - Add conversation history persistence
   - Implement voice activity detection (VAD)
   - Add support for multiple languages
   - Implement conversation analytics

3. **Production Deployment**
   - Set up production WebSocket server
   - Configure SSL/TLS for secure WebSocket (wss://)
   - Set up monitoring and logging
   - Implement rate limiting
   - Add authentication

## Support

For issues or questions:
- Check backend logs: `be/ai_service/app.py`
- Check frontend console: Browser DevTools
- Review WebSocket handler: `be/ai_service/speakjoy_ws.py`
- Review React hook: `fe/hooks/useSpeakJoyCall.ts`
