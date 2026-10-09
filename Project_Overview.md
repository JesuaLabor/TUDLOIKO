Project Prompt: AI Interview Copilot (Desktop Overlay Assistant)

Use this as the master prompt/spec when starting the project with an AI coding assistant (Claude Code, Cursor, etc.) or as your own planning doc.

1. Project Summary

Build a cross-platform desktop application that acts as a floating, movable, always-on-top overlay during video interviews (Zoom, Google Meet, Google Meet in browser, etc.). The app listens to the conversation in real time, transcribes it, and uses Google Gemini to generate live suggested talking points / answer hints for the job applicant, displayed in an unobtrusive floating widget the user can drag, resize, and toggle click-through on.

Primary user: a job applicant who wants discreet, real-time AI assistance during a live interview call.

2. Core Requirements
2.1 Window behavior (the "modal and movable" part)
Frameless, borderless window (no OS title bar)
Always-on-top of other applications, including fullscreen Zoom/Meet windows
Semi-transparent background
Draggable via a custom header/handle region
Resizable
Optional click-through mode (mouse events pass through to the app behind it, except over the widget itself) so it doesn't block clicks on the meeting window
Global keyboard shortcut to show/hide the overlay instantly (important — interviewer should never see it)
Remembers last position/size between launches
2.2 Audio capture
Capture system/loopback audio (what's playing through speakers — i.e., the interviewer's voice from Zoom/Meet), not just the microphone
Must work per-OS:
Windows: WASAPI loopback capture
macOS: requires a virtual audio driver (e.g., BlackHole) or ScreenCaptureKit (macOS 13+) with Screen Recording permission
Linux: PulseAudio/PipeWire monitor source
Optionally also capture mic input separately (to distinguish "interviewer said X" vs "I said Y")
2.3 Transcription
Stream captured audio to a speech-to-text pipeline
Options: Gemini's native audio input (multimodal), or a dedicated STT service (Google Speech-to-Text, Deepgram, AssemblyAI) for lower latency
Maintain a rolling transcript buffer with speaker separation if possible
2.4 AI assistance (Gemini)
Stream transcript chunks + running context to the Gemini API
Use Gemini's streaming response to generate incremental suggestions:
Key points to mention
Suggested concise answer framing
Follow-up questions to ask the interviewer
Maintain conversation context/session so suggestions build on what's already been said (avoid repeating advice)
Allow user to feed in supporting context beforehand: resume/CV, job description, company info — so suggestions are personalized
2.5 UI/UX
Minimal, glanceable design — must be readable in under 2 seconds since the user is mid-conversation
Auto-scrolling suggestion feed
Manual "ask Gemini" trigger in addition to automatic suggestions (for when the user wants to explicitly query something)
Settings panel: opacity, font size, hotkeys, API key management, audio device selection
3. Recommended Tech Stack
Layer	Choice	Why
Desktop shell	Electron (or Tauri for smaller footprint)	Full window control: frameless, always-on-top, click-through, transparent
Frontend	React + TypeScript + Tailwind	Fast to build, matches your existing stack
Native audio capture	Node native module or small Rust/C++ helper binary	Electron has no built-in loopback audio API
STT	Gemini audio input, or Google Speech-to-Text / Deepgram streaming API	Low-latency streaming transcription
AI	Gemini API (streaming)	Requested requirement
Backend (optional)	Django + DRF	Centralize prompt templates, API key security, rate limiting, user auth, resume/job-context storage, usage logs
Packaging	electron-builder	Cross-platform installers (.exe, .dmg, .AppImage)

Why route Gemini calls through your Django backend instead of calling directly from the Electron app: keeps your Gemini API key off the client, lets you control cost/rate limits per user, and gives you a place to store resume/job-description context and conversation history for each user session.

4. Architecture Overview
┌─────────────────────────────┐
│   Electron Main Process      │
│  - window management         │
│  - global shortcuts           │
│  - native audio capture       │
│    (loopback + mic)           │
└───────────┬──────────────────┘
            │ IPC
┌───────────▼──────────────────┐
│  Electron Renderer (React UI) │
│  - overlay window              │
│  - draggable/resizable widget  │
│  - transcript + suggestions UI │
└───────────┬──────────────────┘
            │ WebSocket / HTTPS
┌───────────▼──────────────────┐
│      Django + DRF Backend     │
│  - auth, session mgmt          │
│  - resume/job context storage  │
│  - Gemini API proxy (streaming)│
│  - prompt templates            │
└───────────┬──────────────────┘
            │
      Google Gemini API
5. Suggested MVP Scope (Phase 1)
Electron shell with frameless, always-on-top, draggable overlay window
Global hotkey to show/hide
Manual text input box: user types/pastes what the interviewer just asked → sends to Gemini → streamed suggestion appears
Basic Gemini API integration (direct call is fine for MVP, migrate to backend proxy later)
Simple settings: API key input, opacity slider

Phase 2: add real-time system audio capture + STT + automatic transcript-driven suggestions (this is the hard part — tackle after MVP proves the UX loop works).

Phase 3: Django backend for context storage (resume, job description), multi-session history, click-through toggle, per-OS audio loopback polish, packaged installers.

6. Platform-Specific Notes
macOS is the hardest: Apple requires explicit Screen Recording permission for system audio capture, and the app will need code-signing + notarization to avoid Gatekeeper blocking it.
Windows WASAPI loopback is the most straightforward to implement.
Linux works well via PipeWire/PulseAudio monitor sources.
Zoom and Google Meet have no public API for reading meeting audio passively — system-audio-loopback capture is the only realistic cross-platform approach.
7. Things to Decide Before Building
Direct Gemini calls from Electron client vs. proxied through Django backend (security/cost control vs. simplicity)
Automatic (audio-driven) suggestions vs. manual-trigger-only for MVP
How much conversation context to keep in the rolling buffer (token cost vs. relevance)
Whether to support Windows/macOS/Linux simultaneously or ship one platform first
8. Note on Ethics/Terms of Service

Using an undetected AI overlay during a live interview may violate the policies of the hiring company or platform, and some jurisdictions treat covert recording of calls as requiring two-party consent. This is worth being aware of as you scope features (e.g., stealth/click-through mode) and messaging for the product.