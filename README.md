# Jarvis Voice Assistant

A local JARVIS-style voice assistant with:

- black cinematic interface
- fixed globe-first HUD instead of a full dashboard layout
- animated globe in the center
- browser speech recognition for voice input
- browser speech synthesis with switchable female and male modes
- Google female and male voice locking when Chrome exposes the built-in Google speech voices
- Gemini or OpenRouter world knowledge fallback
- AI action planning for broader natural-language laptop control
- local desktop actions for opening apps, websites, folders, Spotify, volume, and configured tasks
- macOS Shortcuts execution for wider laptop control
- WhatsApp message drafting, with optional auto-send on macOS
- short-term context memory for follow-up commands like `reply saying ...`, `play it`, and `close it`

## Run it

```bash
node server.js
```

Then open [http://127.0.0.1:3000](http://127.0.0.1:3000).

Press `Start Voice` once to grant microphone access. After that, hands-free listening can continue between replies.
Open it in Google Chrome if you want the assistant pinned to Google female and Google male voices.
You do not need to say `Jarvis` first anymore. Every spoken phrase is treated as a command.

## Enable world knowledge

1. Copy [.env.example](/Users/haindavlyada/Documents/jar/.env.example) to `.env`.
2. Put either a Google Gemini API key in `GEMINI_API_KEY` or an OpenRouter key in `OPENROUTER_API_KEY`.
3. Restart the server.

Once that is set, unknown requests fall through to the configured AI provider instead of stopping at "I don't know that command yet."
Gemini can use Google Search grounding. OpenRouter answers are not grounded unless the selected model or provider account adds that separately.
The same AI layer also plans broad natural-language laptop commands into safe actions like opening apps, searching, WhatsApp drafts, and running Shortcuts.

## Deploy on Render

This repo now includes [render.yaml](/Users/haindavlyada/Documents/jar/render.yaml) for a Node web service deploy.

Render setup:

1. Push this folder as its own GitHub repository.
2. Create a new Render Blueprint or Web Service from that repo.
3. Add `OPENROUTER_API_KEY` or `GEMINI_API_KEY` in Render.
4. Deploy.

Public-device note:

- the hosted app UI works across phones, tablets, and laptops
- world knowledge and voice UI can run publicly in supported browsers
- The included Render blueprint sets `KOKORO_SERVER_TTS=0`, and Jarvis now defaults to system/browser speech unless you explicitly enable server-side voice
- hosted deploys now open browser-safe actions on the user's device, such as Google searches, websites, WhatsApp Web drafts, and Spotify Web
- native laptop controls like Wi-Fi, power, shortcuts, local folders, and desktop app automation still need a local desktop runtime and are not available from a plain hosted website on every device

## Desktop app

If you want Jarvis to run as an installable desktop app on a laptop:

1. Install dependencies with `npm install`
2. Start the desktop shell with `npm run desktop`
3. Build installers with `npm run dist`

The desktop app wraps the existing Jarvis UI in Electron and, on macOS, now also builds a native notch-style overlay helper automatically. That helper sits at the top center of the screen, stays alive across spaces, and mirrors Jarvis listening/speaking state while the main app runs in the background.

For the advanced macOS experience:

1. Open Jarvis once
2. Press `Start Voice`
3. Turn on `Menu bar only mode`
4. Leave Jarvis running in the menu bar

Then Jarvis can wake from other apps with `Hey Jarvis`, and the native overlay expands near the notch while it listens or speaks.

### Premium Hindi and Telugu voice

If you want stronger Hindi and Telugu speech on any device, add a Gemini API key in `.env`:

```bash
GEMINI_API_KEY=your_key_here
```

Jarvis will then use:

- `English` -> Kokoro
- `Hindi` -> Gemini premium voice
- `Telugu` -> Gemini premium voice
- multilingual microphone transcription -> Gemini for `auto`, `Hindi`, and `Telugu`, with local Whisper fallback

Optional tuning:

```bash
JARVIS_GEMINI_TTS_MODEL=gemini-2.5-flash-preview-tts
JARVIS_GEMINI_ASR_MODEL=gemini-2.5-flash
JARVIS_GEMINI_TTS_FEMALE_VOICE=Aoede
JARVIS_GEMINI_TTS_MALE_VOICE=Kore
```

## What it can do

Speak commands like:

- `open WhatsApp`
- `open Spotify and play my liked songs`
- `next song`
- `set volume to 40`
- `close Spotify`
- `open downloads`
- `search Google for laptop voice assistant ideas`
- `who is the prime minister of India?`
- `message dad saying I will be late`
- `reply saying I am on my way`
- `run shortcut Movie Mode`
- `lock the screen`
- `show commands`
- `history`

## Configure contacts and actions

Edit [config/assistant.config.json](/Users/haindavlyada/Documents/jar/config/assistant.config.json).

WhatsApp targets can come from either:

- `config/assistant.config.json`
- the macOS Contacts app, if Contacts permission is available

### Add a real WhatsApp contact

Replace the placeholder phone:

```json
"dad": {
  "displayName": "Dad",
  "phone": "919876543210",
  "aliases": ["father", "papa"]
}
```

### Spotify control

You can keep the default:

```json
"spotify": {
  "likedSongsUri": "spotify:collection:tracks"
}
```

That is what the assistant uses for commands like `open Spotify and play my liked songs`.

### Add more custom laptop actions

Every custom action is phrase-based. That means the assistant only runs the exact phrases you configure, which is much safer than giving raw spoken shell access.

Example:

```json
{
  "phrase": "open my project folder",
  "description": "open my project folder",
  "command": "open ~/Documents/my-project",
  "requiresConfirmation": false
}
```

## Full laptop control path

For "everything" control on a Mac, the best setup is:

1. Use Gemini or OpenRouter for general world knowledge.
2. Use built-in commands for opening apps, sites, folders, and sending messages.
3. Add exact phrase `customActions` for shell or AppleScript tasks.
4. Create macOS Shortcuts for larger automations, then say commands like `Jarvis, run shortcut Morning Routine`.

If a request is understood but still not executable, wire it in as a custom action or Shortcut instead of giving the assistant unrestricted raw shell control.

That lets you automate multi-step flows like:

- open several apps
- switch focus modes
- control sound and brightness
- start work mode or study mode
- trigger smart home shortcuts
- send prepared messages

## Optional macOS auto-send

If you want WhatsApp messages to send automatically instead of opening as a draft:

1. Change `"messageDelivery"` from `"draft"` to `"autoSend"` in [config/assistant.config.json](/Users/haindavlyada/Documents/jar/config/assistant.config.json).
2. Allow microphone access in your browser.
3. Allow Accessibility and Automation permissions for the browser or terminal app that is opening WhatsApp.

If macOS blocks the scripted Enter key, the assistant falls back to opening the draft message for manual confirmation.
