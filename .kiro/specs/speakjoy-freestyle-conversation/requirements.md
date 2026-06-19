# Requirements Document

## Introduction

SpeakJoy Freestyle Conversation is a real-time voice conversation system for children (ages 5–10) learning English. A child initiates a call with an AI character named Joy, who greets the child and engages in a natural back-and-forth English conversation. The system uses WebSocket transport for low-latency communication, with proper turn-taking protocol to ensure only one party speaks at a time. Audio is captured from the child's microphone, transcribed via ASR, processed by an LLM to generate a contextual response, and spoken back via TTS — all displayed as chat bubbles on screen.

This rebuild addresses critical issues in the current implementation: blind audio segmentation without voice activity detection, ASR language misconfiguration, echo from recording during AI playback, silence-triggered errors, missing chat messages, and lack of turn-taking protocol.

## Glossary

- **Conversation_System**: The complete SpeakJoy freestyle conversation feature spanning frontend and backend
- **Frontend_Client**: The Next.js React application that captures audio, plays TTS, and displays the conversation UI
- **Backend_Handler**: The Python FastAPI WebSocket endpoint that orchestrates ASR, LLM, and TTS processing
- **Session**: A single conversation instance between a child and Joy, from call start to call end
- **Turn**: One complete exchange cycle where one party speaks and the other listens
- **VAD (Voice Activity Detection)**: Client-side logic that detects when the child is actively speaking versus silent
- **ASR (Automatic Speech Recognition)**: The service that converts child speech audio into English text
- **LLM (Large Language Model)**: The AI service that generates Joy's conversational responses
- **TTS (Text-to-Speech)**: The service that converts Joy's text responses into spoken audio
- **Turn_State_Machine**: The state machine governing who may speak at any given time (child or AI)
- **Audio_Recorder**: The frontend component responsible for capturing microphone audio
- **Audio_Player**: The frontend component responsible for playing TTS audio chunks
- **WebSocket_Transport**: The bidirectional communication channel between Frontend_Client and Backend_Handler

## Requirements

### Requirement 1: WebSocket Connection Lifecycle

**User Story:** As a child, I want to start and end a voice call with Joy reliably, so that I can have a conversation without technical interruptions.

#### Acceptance Criteria

1. WHEN the child presses the call button, THE Frontend_Client SHALL request microphone permission and establish a WebSocket connection to the Backend_Handler
2. WHEN the WebSocket connection is established, THE Frontend_Client SHALL send a configuration message containing child_name, child_age, and topic_name
3. WHEN the Backend_Handler receives a valid configuration message, THE Backend_Handler SHALL create a new Session and respond with a session_started event
4. IF the WebSocket connection drops unexpectedly, THEN THE Frontend_Client SHALL attempt reconnection up to 3 times with exponential backoff
5. WHEN the child presses the end-call button, THE Frontend_Client SHALL stop recording, close the WebSocket connection, and reset the UI to the idle state
6. IF microphone permission is denied, THEN THE Frontend_Client SHALL display a clear error message and remain in the idle state without attempting a WebSocket connection

### Requirement 2: AI Greeting on Call Start

**User Story:** As a child, I want Joy to greet me when I start a call, so that I know the conversation has begun and feel welcomed.

#### Acceptance Criteria

1. WHEN a Session is created successfully, THE Backend_Handler SHALL generate a personalized greeting using the child's name and optional topic
2. WHEN the greeting is generated, THE Backend_Handler SHALL send the greeting text as an llm_final event and synthesize TTS audio for the greeting
3. WHEN the Frontend_Client receives the greeting TTS audio, THE Audio_Player SHALL play the greeting audio before enabling the child's microphone for recording
4. WHEN the greeting audio finishes playing, THE Turn_State_Machine SHALL transition to the child_turn state, enabling audio recording

### Requirement 3: Voice Activity Detection

**User Story:** As a child, I want the system to detect when I am speaking and when I am silent, so that it only processes my actual speech and does not send empty audio.

#### Acceptance Criteria

1. WHILE the Turn_State_Machine is in child_turn state, THE Audio_Recorder SHALL continuously monitor microphone input amplitude
2. WHEN the audio amplitude exceeds the speech threshold for at least 200 milliseconds, THE VAD SHALL classify the input as active speech
3. WHILE the VAD classifies input as active speech, THE Audio_Recorder SHALL accumulate audio data into a buffer
4. WHEN the audio amplitude drops below the speech threshold for a configurable silence duration (default 1500 milliseconds), THE VAD SHALL classify the input as end-of-speech
5. WHEN end-of-speech is detected, THE Frontend_Client SHALL send the accumulated audio buffer to the Backend_Handler followed by an audio_final message
6. IF no speech is detected for 10 seconds continuously, THEN THE Frontend_Client SHALL remain in listening state without sending any audio data to the Backend_Handler

### Requirement 4: Turn-Taking Protocol

**User Story:** As a child, I want the system to take turns properly so that Joy and I do not talk over each other.

#### Acceptance Criteria

1. THE Turn_State_Machine SHALL maintain exactly one of four states: idle, child_turn, ai_processing, or ai_speaking
2. WHEN the greeting audio finishes playing, THE Turn_State_Machine SHALL transition from ai_speaking to child_turn
3. WHEN the Frontend_Client sends audio_final, THE Turn_State_Machine SHALL transition from child_turn to ai_processing
4. WHEN the Backend_Handler begins generating an LLM response, THE Turn_State_Machine SHALL remain in ai_processing state
5. WHEN the first TTS audio chunk is ready for playback, THE Turn_State_Machine SHALL transition from ai_processing to ai_speaking
6. WHEN all TTS audio chunks have finished playing, THE Turn_State_Machine SHALL transition from ai_speaking to child_turn
7. WHILE the Turn_State_Machine is in ai_speaking state, THE Audio_Recorder SHALL be disabled and not capture any microphone input
8. WHILE the Turn_State_Machine is in ai_processing state, THE Audio_Recorder SHALL be disabled and not capture any microphone input

### Requirement 5: Audio Recording and Encoding

**User Story:** As a child, I want my voice to be captured clearly so that the AI can understand what I say.

#### Acceptance Criteria

1. THE Audio_Recorder SHALL capture audio in mono channel at 16kHz sample rate with echo cancellation and noise suppression enabled
2. WHEN recording is active, THE Audio_Recorder SHALL encode audio in WebM/Opus format for efficient transmission
3. WHEN end-of-speech is detected by the VAD, THE Audio_Recorder SHALL send the complete audio segment as a single base64-encoded chunk via the WebSocket
4. THE Audio_Recorder SHALL discard audio segments shorter than 300 milliseconds as they are too short for meaningful speech recognition
5. IF the accumulated audio segment exceeds 30 seconds, THEN THE Audio_Recorder SHALL automatically trigger end-of-speech and send the segment

### Requirement 6: Speech Recognition (ASR)

**User Story:** As a child speaking English, I want my speech to be accurately transcribed into English text so that Joy can understand and respond to me.

#### Acceptance Criteria

1. WHEN the Backend_Handler receives an audio_final message with preceding audio data, THE Backend_Handler SHALL decode the audio from WebM/Opus to 16kHz mono WAV format
2. WHEN the decoded audio is ready, THE Backend_Handler SHALL send the audio to the ASR service with the language explicitly set to English
3. WHEN the ASR service returns a transcript, THE Backend_Handler SHALL send an asr_final event containing the English transcript text to the Frontend_Client
4. IF the ASR service returns an empty transcript, THEN THE Backend_Handler SHALL send a turn_closed event to re-enable the child's turn without generating an LLM response
5. IF the ASR service fails with an error, THEN THE Backend_Handler SHALL send an error event with a child-friendly message and a turn_closed event to re-enable the child's turn

### Requirement 7: LLM Response Generation

**User Story:** As a child, I want Joy to respond to what I say in a fun and encouraging way that helps me learn English.

#### Acceptance Criteria

1. WHEN a valid ASR transcript is committed, THE Backend_Handler SHALL send the transcript along with conversation history to the LLM service
2. THE Backend_Handler SHALL include a system prompt instructing the LLM to respond as Joy: using simple English appropriate for the child's age, limiting responses to 2 sentences, and ending with a question to encourage continued conversation
3. WHEN the LLM begins generating tokens, THE Backend_Handler SHALL send an llm_started event to the Frontend_Client
4. WHILE the LLM is streaming tokens, THE Backend_Handler SHALL send llm_token events containing each token and the accumulated text so far
5. WHEN the LLM finishes generating the response, THE Backend_Handler SHALL send an llm_final event containing the complete response text
6. IF the LLM service fails, THEN THE Backend_Handler SHALL send an error event and a turn_closed event to re-enable the child's turn

### Requirement 8: Text-to-Speech Synthesis

**User Story:** As a child, I want to hear Joy's responses spoken aloud clearly and slowly so that I can understand the English words.

#### Acceptance Criteria

1. WHEN the LLM produces enough text (configurable words-per-chunk, default 4 words), THE Backend_Handler SHALL send that text chunk to the TTS service for synthesis
2. WHEN TTS audio is synthesized for a chunk, THE Backend_Handler SHALL send a tts_chunk_ready event containing the chunk index, text, and base64-encoded audio
3. THE Backend_Handler SHALL synthesize TTS with a child-friendly English voice at a slow speaking rate
4. WHEN the Frontend_Client receives a tts_chunk_ready event, THE Audio_Player SHALL queue the audio chunk for sequential playback
5. WHEN an audio chunk finishes playing, THE Frontend_Client SHALL send a chunk_played message to the Backend_Handler and play the next queued chunk
6. WHEN all queued audio chunks have been played, THE Frontend_Client SHALL notify the Turn_State_Machine that ai_speaking is complete

### Requirement 9: Chat Message Display

**User Story:** As a child, I want to see what I said and what Joy said as chat bubbles on screen so that I can read along and learn.

#### Acceptance Criteria

1. WHEN an asr_final event is received, THE Frontend_Client SHALL display the child's transcript as a user chat bubble aligned to the right
2. WHEN an llm_final event is received, THE Frontend_Client SHALL display Joy's response as an assistant chat bubble aligned to the left
3. WHEN a new chat bubble is added, THE Frontend_Client SHALL auto-scroll the message container to show the latest message
4. WHILE the LLM is streaming tokens, THE Frontend_Client SHALL display the streaming text in a temporary indicator above the chat area
5. WHILE the child is speaking and partial transcript is available, THE Frontend_Client SHALL display the partial transcript in a listening indicator

### Requirement 10: Error Handling and Recovery

**User Story:** As a child, I want the system to handle problems gracefully so that I can continue my conversation without confusion.

#### Acceptance Criteria

1. IF any backend service (ASR, LLM, TTS) fails during a turn, THEN THE Backend_Handler SHALL send an error event followed by a turn_closed event so the child can try speaking again
2. IF the WebSocket connection is lost during a call, THEN THE Frontend_Client SHALL display a reconnecting indicator and attempt to reconnect
3. IF reconnection fails after 3 attempts, THEN THE Frontend_Client SHALL display a connection-lost message and return to the idle state
4. IF the Audio_Player fails to play a TTS chunk, THEN THE Audio_Player SHALL skip the failed chunk and continue with the next queued chunk
5. THE Frontend_Client SHALL display error messages in a non-blocking toast that auto-dismisses after 5 seconds

### Requirement 11: Session State Management

**User Story:** As a child, I want my conversation history to be maintained during the call so that Joy remembers what we talked about.

#### Acceptance Criteria

1. THE Backend_Handler SHALL maintain a conversation history list containing all user and bot messages for the duration of the Session
2. WHEN generating an LLM response, THE Backend_Handler SHALL include the last 10 messages from conversation history as context
3. WHEN the Session is closed, THE Backend_Handler SHALL release all resources associated with the Session including conversation history
4. THE Frontend_Client SHALL maintain its own message list for display purposes, independent of the backend history

### Requirement 12: UI State and Visual Feedback

**User Story:** As a child, I want to see visual indicators showing what Joy is doing so that I know when to speak and when to listen.

#### Acceptance Criteria

1. WHILE the Turn_State_Machine is in child_turn state, THE Frontend_Client SHALL display a listening indicator with a microphone icon
2. WHILE the Turn_State_Machine is in ai_processing state, THE Frontend_Client SHALL display a thinking indicator
3. WHILE the Turn_State_Machine is in ai_speaking state, THE Frontend_Client SHALL display a speaking indicator with an animation on Joy's character
4. WHEN the call is active, THE Frontend_Client SHALL display a call duration timer updated every second
5. THE Frontend_Client SHALL display Joy's character avatar with contextual animations matching the current Turn_State_Machine state
