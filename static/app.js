const state = {
  config: null,
  speaking: false,
  listening: false,
  handsFree: true,
  awaitingConfirmation: false,
  voiceMode: "female",
  recognition: null,
  femaleVoice: null,
  maleVoice: null,
  voices: [],
  subtitleFrames: [],
  subtitleFrameIndex: -1,
  subtitleInterval: null,
  subtitleHideTimeout: null,
  speechUnlocked: false,
  drawerMode: "none",
  historyEntries: [],
  recognitionLang: "en-IN",
  lastProcessedTranscript: "",
  lastProcessedAt: 0,
  audio: null,
  speechResolve: null,
  speechAbortController: null,
  speechJobId: 0,
  commandAbortController: null,
  activeAssistantSpeech: "",
  activeAssistantSpeechNormalized: "",
  recentAssistantSpeechNormalized: "",
  echoIgnoreUntil: 0,
  commandWindowUntil: 0,
  hasStartedRecognition: false,
  pendingSpeechText: "",
  listeningResumeTimeout: null,
  serverTtsDisabled: false,
  serverTtsError: ""
};

const dom = {
  heroPanel: document.querySelector(".hero-panel"),
  assistantName: document.querySelector("#assistantName"),
  statusPill: document.querySelector("#statusPill"),
  recognitionBadge: document.querySelector("#recognitionBadge"),
  voiceBadge: document.querySelector("#voiceBadge"),
  voiceProviderName: document.querySelector("#voiceProviderName"),
  voiceNote: document.querySelector("#voiceNote"),
  centerLabel: document.querySelector("#centerLabel"),
  assistantLine: document.querySelector("#assistantLine"),
  centerNote: document.querySelector("#centerNote"),
  subtitleRail: document.querySelector("#subtitleRail"),
  subtitleText: document.querySelector("#subtitleText"),
  orbDrawer: document.querySelector("#orbDrawer"),
  drawerLabel: document.querySelector("#drawerLabel"),
  drawerTitle: document.querySelector("#drawerTitle"),
  drawerContent: document.querySelector("#drawerContent"),
  closeDrawerButton: document.querySelector("#closeDrawerButton"),
  startButton: document.querySelector("#startButton"),
  stopButton: document.querySelector("#stopButton"),
  handsFreeToggle: document.querySelector("#handsFreeToggle"),
  textCommandForm: document.querySelector("#textCommandForm"),
  textCommand: document.querySelector("#textCommand"),
  dockStartButton: document.querySelector("#dockStartButton"),
  dockStopButton: document.querySelector("#dockStopButton"),
  dockTextCommandForm: document.querySelector("#dockTextCommandForm"),
  dockTextCommand: document.querySelector("#dockTextCommand"),
  femaleVoiceName: document.querySelector("#femaleVoiceName"),
  maleVoiceName: document.querySelector("#maleVoiceName"),
  quickCommands: document.querySelector("#quickCommands"),
  history: document.querySelector("#history"),
  modeButtons: Array.from(document.querySelectorAll(".mode-button")),
  canvas: document.querySelector("#globeCanvas")
};

const FEMALE_HINTS = [
  "female",
  "samantha",
  "victoria",
  "karen",
  "zira",
  "allison",
  "ava",
  "tessa",
  "moira",
  "susan",
  "fiona",
  "serena",
  "veena"
];

const MALE_HINTS = [
  "male",
  "alex",
  "daniel",
  "fred",
  "jorge",
  "aaron",
  "arthur",
  "lee",
  "oliver",
  "rishi",
  "thomas"
];

const FEMALE_VOICE_PRIORITY = [
  "Flo (English (US))",
  "Samantha",
  "Google US English Female",
  "Google UK English Female",
  "Google English Female",
  "Karen",
  "Moira",
  "Tessa",
  "Victoria",
  "Allison",
  "Veena",
  "Serena"
];

const MALE_VOICE_PRIORITY = [
  "Eddy (English (US))",
  "Daniel",
  "Google US English Male",
  "Google UK English Male",
  "Google English Male",
  "Google US English"
];

const STOP_COMMAND_PATTERNS = [
  /^stop(?:\s+it)?$/i,
  /^stop\s+jarvis$/i,
  /^quiet$/i,
  /^be\s+quiet$/i,
  /^pause$/i,
  /^enough$/i
];

const WAKE_COMMAND_PATTERNS = [
  /^(?:hey|hi|hello)\s+jarvis\b[\s,:.!-]*(.*)$/i,
  /^jarvis\b[\s,:.!-]*(.*)$/i
];

const COMMAND_WINDOW_MS = 45000;
const ECHO_IGNORE_MS = 3200;
const LISTENING_WATCHDOG_MS = 1400;
const TTS_REQUEST_TIMEOUT_MS = 14000;
const AUDIO_PLAYBACK_TIMEOUT_MS = 12000;
const MIC_PERMISSION_KEY = "jarvis-mic-enabled";

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extendCommandWindow(durationMs = COMMAND_WINDOW_MS) {
  state.commandWindowUntil = Date.now() + durationMs;
}

function clearCommandWindow() {
  state.commandWindowUntil = 0;
}

function commandWindowOpen() {
  return state.awaitingConfirmation || Date.now() < state.commandWindowUntil;
}

function rememberMicPermission() {
  try {
    window.localStorage.setItem(MIC_PERMISSION_KEY, "1");
  } catch (error) {
    // Ignore storage failures in private browsing or locked-down contexts.
  }
}

function userPreviouslyEnabledMic() {
  try {
    return window.localStorage.getItem(MIC_PERMISSION_KEY) === "1";
  } catch (error) {
    return false;
  }
}

function parseWakePhrase(transcript) {
  const raw = String(transcript || "").trim();
  for (const pattern of WAKE_COMMAND_PATTERNS) {
    const match = raw.match(pattern);
    if (match) {
      return {
        wakeMatched: true,
        command: String(match[1] || "").trim()
      };
    }
  }

  return {
    wakeMatched: false,
    command: raw
  };
}

function describeListeningMode() {
  if (state.awaitingConfirmation) {
    return "Say yes to continue or no to cancel.";
  }

  if (commandWindowOpen()) {
    return `Jarvis is awake. Speak your command now. Recognition is tuned for ${state.recognitionLang}.`;
  }

  return `Say "Hey Jarvis" to wake, or just start with "Jarvis". Recognition is tuned for ${state.recognitionLang}.`;
}

function showWakeCue() {
  extendCommandWindow();
  setMainLine("Listening for your command");
  setStatus({
    label: "Wake word detected",
    pill: "Awake",
    note: describeListeningMode()
  });
  setSubtitle("Listening...");

  window.clearTimeout(state.subtitleHideTimeout);
  state.subtitleHideTimeout = window.setTimeout(() => {
    if (!state.speaking && !state.awaitingConfirmation) {
      clearSubtitle();
    }
    state.subtitleHideTimeout = null;
  }, 1400);
}

function addHistory(role, text, options = {}) {
  state.historyEntries.unshift({
    role,
    text,
    pending: Boolean(options.pending),
    sources: Array.isArray(options.sources) ? options.sources : []
  });
  if (state.historyEntries.length > 40) {
    state.historyEntries.length = 40;
  }

  const message = document.createElement("div");
  message.className = `message ${role}${options.pending ? " pending" : ""}`;
  const heading = document.createElement("strong");
  heading.textContent = role === "assistant" ? state.config?.assistantName || "Jarvis" : "You";
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  message.append(heading, paragraph);

  if (role === "assistant" && Array.isArray(options.sources) && options.sources.length) {
    const sourcesWrap = document.createElement("div");
    sourcesWrap.className = "message-sources";

    const label = document.createElement("span");
    label.className = "message-source-label";
    label.textContent = "Sources";
    sourcesWrap.append(label);

    for (const source of options.sources) {
      const link = document.createElement("a");
      link.className = "message-source-link";
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = source.title;
      sourcesWrap.append(link);
    }

    message.append(sourcesWrap);
  }

  dom.history.prepend(message);

  if (state.drawerMode === "history") {
    renderDrawer();
  }
}

function setStatus({ label, pill, note }) {
  dom.centerLabel.textContent = label;
  dom.statusPill.textContent = pill;
  dom.centerNote.textContent = note;
}

function updateRecognitionBadge() {
  dom.recognitionBadge.textContent = state.listening ? "Mic live" : "Mic off";
}

function updateVoiceBadge() {
  if (activeTtsProvider() === "kokoro_server") {
    dom.voiceBadge.textContent =
      state.voiceMode === "female" ? "Kokoro Female" : "Kokoro Male";
    return;
  }

  if (activeTtsProvider() === "native_mac") {
    dom.voiceBadge.textContent =
      state.voiceMode === "female" ? "Mac Female" : "Mac Male";
    return;
  }

  dom.voiceBadge.textContent =
    state.voiceMode === "female" ? "Browser Female" : "Browser Male";
}

function setMainLine(text) {
  dom.assistantLine.textContent = text;
}

function setDrawer(mode) {
  state.drawerMode = mode;
  const active = mode !== "none";
  dom.orbDrawer.classList.toggle("active", active);
  if (!active) {
    return;
  }
  renderDrawer();
}

function createDrawerBlock(title, body, options = {}) {
  const block = document.createElement("div");
  block.className = "drawer-block";

  const heading = document.createElement("strong");
  heading.textContent = title;
  block.append(heading);

  if (body) {
    const paragraph = document.createElement("p");
    paragraph.textContent = body;
    block.append(paragraph);
  }

  if (options.buttonLabel && options.onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = options.buttonLabel;
    button.addEventListener("click", () => {
      unlockSpeech();
      options.onClick();
    });
    block.append(button);
  }

  if (Array.isArray(options.sources) && options.sources.length) {
    const sourceList = document.createElement("div");
    sourceList.className = "drawer-source-list";
    for (const source of options.sources) {
      const link = document.createElement("a");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = source.title;
      sourceList.append(link);
    }
    block.append(sourceList);
  }

  return block;
}

function renderCommandsDrawer() {
  dom.drawerLabel.textContent = "Display";
  dom.drawerTitle.textContent = "Commands";
  dom.drawerContent.innerHTML = "";

  const commands = [
    ...(state.config?.examples || []),
    "history",
    ...(state.config?.customActions || []).map((action) => action.phrase)
  ];

  for (const command of commands.slice(0, 12)) {
    dom.drawerContent.append(
      createDrawerBlock(command, "Tap to run or say it out loud.", {
        buttonLabel: "Run command",
        onClick: () => runCommand(command)
      })
    );
  }
}

function renderHistoryDrawer() {
  dom.drawerLabel.textContent = "Display";
  dom.drawerTitle.textContent = "History";
  dom.drawerContent.innerHTML = "";

  if (!state.historyEntries.length) {
    const empty = document.createElement("div");
    empty.className = "drawer-empty";
    empty.textContent = "No conversation history yet.";
    dom.drawerContent.append(empty);
    return;
  }

  for (const entry of state.historyEntries) {
    dom.drawerContent.append(
      createDrawerBlock(
        entry.role === "assistant" ? state.config?.assistantName || "Jarvis" : "You",
        entry.text,
        {
          sources: entry.sources
        }
      )
    );
  }
}

function renderDrawer() {
  if (state.drawerMode === "commands") {
    renderCommandsDrawer();
    return;
  }

  if (state.drawerMode === "history") {
    renderHistoryDrawer();
    return;
  }

  dom.drawerContent.innerHTML = "";
}

function defaultHeadline() {
  return state.awaitingConfirmation
    ? "Awaiting your confirmation"
    : "Awaiting your voice";
}

function stopSubtitleTimers() {
  if (state.subtitleInterval) {
    window.clearInterval(state.subtitleInterval);
    state.subtitleInterval = null;
  }
  if (state.subtitleHideTimeout) {
    window.clearTimeout(state.subtitleHideTimeout);
    state.subtitleHideTimeout = null;
  }
}

function setSubtitle(text) {
  const value = String(text || "").trim();
  dom.subtitleText.textContent = value;
  dom.subtitleRail.classList.toggle("active", Boolean(value));
  dom.heroPanel?.classList.toggle("has-subtitle", Boolean(value));
}

function clearSubtitle() {
  setSubtitle("");
}

function rememberPendingSpeech(text) {
  state.pendingSpeechText = String(text || "").trim();
}

function clearPendingSpeech() {
  state.pendingSpeechText = "";
}

function clearListeningResume() {
  if (state.listeningResumeTimeout) {
    window.clearTimeout(state.listeningResumeTimeout);
    state.listeningResumeTimeout = null;
  }
}

function scheduleListeningResume(delayMs = 520) {
  clearListeningResume();

  if (!state.handsFree || !state.recognition) {
    return;
  }

  state.listeningResumeTimeout = window.setTimeout(() => {
    state.listeningResumeTimeout = null;
    if (state.handsFree && state.recognition && !state.speaking && !state.listening) {
      startListening();
    }
  }, delayMs);
}

function describeVoiceUnlockNote() {
  return "Tap anywhere once to unlock Kokoro voice. Jarvis will keep listening and can speak after that.";
}

function isAudioUnlockError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    error?.name === "NotAllowedError" ||
    message.includes("didn t interact with the document first") ||
    message.includes("didn't interact with the document first") ||
    message.includes("play() failed") ||
    message.includes("notallowederror") ||
    message.includes("user gesture")
  );
}

async function flushPendingSpeech() {
  if (!state.speechUnlocked || !state.pendingSpeechText || state.speaking) {
    return;
  }

  const pendingText = state.pendingSpeechText;
  clearPendingSpeech();
  await speak(pendingText, { fromPending: true });
}

function queueSpeechUntilUnlock(text) {
  rememberPendingSpeech(text);
  setMainLine("Tap once to enable Jarvis voice");
  setStatus({
    label: "Voice locked by browser",
    pill: "Tap once",
    note: describeVoiceUnlockNote()
  });

  if (!state.awaitingConfirmation && !state.speaking) {
    setSubtitle("Tap once to hear Jarvis");
  }
}

function resumeSpeechOutput() {
  try {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.resume();
    }
  } catch (error) {
    // Some browsers throw if speech is not yet initialized.
  }
}

function unlockSpeech() {
  state.speechUnlocked = true;
  resumeSpeechOutput();

  window.setTimeout(() => {
    void flushPendingSpeech();
  }, 0);
}

function buildSubtitleFrames(text) {
  const source = String(text || "").trim();
  if (!source) {
    return [];
  }

  const words = Array.from(source.matchAll(/\S+/g)).map((match) => ({
    text: match[0],
    start: match.index,
    end: match.index + match[0].length
  }));

  if (!words.length) {
    return [];
  }

  const frames = [];
  let buffer = [];

  const pushBuffer = () => {
    if (!buffer.length) {
      return;
    }
    const start = buffer[0].start;
    const end = buffer[buffer.length - 1].end;
    frames.push({
      start,
      end,
      text: source.slice(start, end).trim()
    });
    buffer = [];
  };

  for (const word of words) {
    buffer.push(word);
    const punctuationBreak = /[.!?,;:]$/.test(word.text);
    const hardBreak = buffer.length >= 8;
    if (punctuationBreak || hardBreak) {
      pushBuffer();
    }
  }

  pushBuffer();
  return frames.length
    ? frames
    : [
        {
          start: 0,
          end: source.length,
          text: source
        }
      ];
}

function showSubtitleFrame(index) {
  if (!state.subtitleFrames.length) {
    setSubtitle("");
    return;
  }

  const nextIndex = Math.max(0, Math.min(index, state.subtitleFrames.length - 1));
  if (nextIndex === state.subtitleFrameIndex) {
    return;
  }

  state.subtitleFrameIndex = nextIndex;
  setSubtitle(state.subtitleFrames[nextIndex].text);
}

function frameIndexForCharIndex(charIndex) {
  for (let index = 0; index < state.subtitleFrames.length; index += 1) {
    if (charIndex <= state.subtitleFrames[index].end) {
      return index;
    }
  }
  return Math.max(0, state.subtitleFrames.length - 1);
}

function startSubtitlePlayback(text, speechRate) {
  stopSubtitleTimers();
  state.subtitleFrames = buildSubtitleFrames(text);
  state.subtitleFrameIndex = -1;

  if (!state.subtitleFrames.length) {
    setSubtitle("");
    return;
  }

  showSubtitleFrame(0);

  const wordCount = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const estimatedDurationMs = Math.max(
    1800,
    (wordCount / (2.6 * Math.max(speechRate || 1, 0.75))) * 1000
  );
  const intervalMs = Math.max(
    900,
    estimatedDurationMs / Math.max(state.subtitleFrames.length, 1)
  );

  state.subtitleInterval = window.setInterval(() => {
    if (state.subtitleFrameIndex >= state.subtitleFrames.length - 1) {
      stopSubtitleTimers();
      return;
    }
    showSubtitleFrame(state.subtitleFrameIndex + 1);
  }, intervalMs);
}

function updateSubtitlePlayback(charIndex) {
  if (!state.subtitleFrames.length) {
    return;
  }

  const frameIndex = frameIndexForCharIndex(charIndex);
  if (frameIndex > state.subtitleFrameIndex) {
    showSubtitleFrame(frameIndex);
    if (state.subtitleInterval) {
      window.clearInterval(state.subtitleInterval);
      state.subtitleInterval = null;
    }
  }
}

function finishSubtitlePlayback() {
  stopSubtitleTimers();
  if (!state.subtitleFrames.length) {
    return;
  }

  showSubtitleFrame(state.subtitleFrames.length - 1);
  state.subtitleFrames = [];
  state.subtitleFrameIndex = -1;
}

function inferVoiceGroup(voice) {
  const label = `${voice.name} ${voice.lang}`.toLowerCase();
  if (FEMALE_HINTS.some((hint) => label.includes(hint))) {
    return "female";
  }
  if (MALE_HINTS.some((hint) => label.includes(hint))) {
    return "male";
  }
  return "neutral";
}

function collectVoices() {
  const voices = window.speechSynthesis
    .getVoices()
    .filter((voice) => /^en(-|$)/i.test(voice.lang) || /india/i.test(voice.name))
    .sort((left, right) => left.name.localeCompare(right.name));

  state.voices = voices.length ? voices : window.speechSynthesis.getVoices();
  lockPreferredVoices();
}

function exactVoiceByName(candidates) {
  for (const candidate of candidates) {
    const match = state.voices.find((voice) => voice.name === candidate);
    if (match) {
      return match;
    }
  }
  return null;
}

function googleVoices() {
  return state.voices.filter((voice) => /google/i.test(voice.name));
}

function preferredVoiceFor(mode) {
  const exactMatch =
    mode === "female"
      ? exactVoiceByName(FEMALE_VOICE_PRIORITY)
      : exactVoiceByName(MALE_VOICE_PRIORITY);

  if (exactMatch) {
    return exactMatch;
  }

  const groupedGoogle = googleVoices().filter(
    (voice) => inferVoiceGroup(voice) === mode
  );
  if (groupedGoogle.length) {
    return groupedGoogle[0];
  }

  if (mode === "male") {
    const googleUsEnglish = googleVoices().find(
      (voice) => voice.name === "Google US English"
    );
    if (googleUsEnglish) {
      return googleUsEnglish;
    }
  }

  return null;
}

function bestFallbackVoiceFor(mode) {
  const exactGroup = state.voices.filter((voice) => inferVoiceGroup(voice) === mode);
  if (exactGroup.length) {
    return exactGroup[0];
  }
  return state.voices[0] || null;
}

function voiceLabel(voice, fallbackLabel) {
  if (!voice) {
    return fallbackLabel;
  }
  return voice.name;
}

function configuredServerProvider() {
  return ["kokoro_server", "native_mac"].includes(state.config?.tts?.provider)
    ? state.config.tts.provider
    : "";
}

function activeTtsProvider() {
  if (
    configuredServerProvider() &&
    !state.serverTtsDisabled &&
    state.config?.tts?.available !== false
  ) {
    return state.config.tts.provider;
  }

  return "browser";
}

function serverTtsFallbackNote() {
  const configuredProvider = configuredServerProvider();
  const status = state.config?.tts?.status;
  const errorMessage = state.serverTtsError || state.config?.tts?.error || "";

  if (configuredProvider === "kokoro_server") {
    if (status === "loading" || status === "idle") {
      return "Kokoro is still warming up on the server, so Jarvis is using browser speech for now.";
    }

    if (errorMessage) {
      return `Kokoro is unavailable right now, so Jarvis switched to browser speech. ${errorMessage}`;
    }
  }

  if (configuredProvider === "native_mac" && errorMessage) {
    return `Native server audio is unavailable right now, so Jarvis switched to browser speech. ${errorMessage}`;
  }

  return "Jarvis is using the clearest available female and male voices exposed by this browser.";
}

function usesServerAudio() {
  return ["kokoro_server", "native_mac"].includes(activeTtsProvider());
}

function updateVoiceLockSummary() {
  if (activeTtsProvider() === "kokoro_server") {
    dom.voiceProviderName.textContent = "Kokoro Neural TTS";
    dom.femaleVoiceName.textContent =
      state.config.tts.femaleVoice || "Kokoro female voice";
    dom.maleVoiceName.textContent =
      state.config.tts.maleVoice || "Kokoro male voice";
    dom.voiceNote.textContent =
      "Jarvis is using Kokoro only. The first reply can take a moment while the model loads, then it stays cached.";
    return;
  }

  if (activeTtsProvider() === "native_mac") {
    dom.voiceProviderName.textContent = "Native macOS TTS";
    dom.femaleVoiceName.textContent =
      state.config.tts.femaleVoice || "Native female voice";
    dom.maleVoiceName.textContent =
      state.config.tts.maleVoice || "Native male voice";
    dom.voiceNote.textContent =
      "Jarvis is speaking through native macOS voices for clearer, more human output.";
    return;
  }

  dom.voiceProviderName.textContent = "Browser Speech";
  dom.femaleVoiceName.textContent = voiceLabel(state.femaleVoice, "No female voice found");
  dom.maleVoiceName.textContent = voiceLabel(state.maleVoice, "No male voice found");
  dom.voiceNote.textContent = serverTtsFallbackNote();
}

function disableServerTts(error) {
  state.serverTtsDisabled = true;
  state.serverTtsError = String(error?.message || error || "").trim();
  updateVoiceBadge();
  updateVoiceLockSummary();
}

function lockPreferredVoices() {
  if (!state.voices.length) {
    dom.femaleVoiceName.textContent = "No speech voices found";
    dom.maleVoiceName.textContent = "No speech voices found";
    dom.voiceNote.textContent =
      "Use a desktop browser that exposes system speech voices.";
    return;
  }

  state.femaleVoice = preferredVoiceFor("female") || bestFallbackVoiceFor("female");
  state.maleVoice = preferredVoiceFor("male") || bestFallbackVoiceFor("male");
  updateVoiceLockSummary();
}

function currentVoice() {
  return state.voiceMode === "female" ? state.femaleVoice : state.maleVoice;
}

function preferredRecognitionLang() {
  const languages = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language || "en-IN"];
  const normalized = languages
    .map((language) => String(language || "").trim())
    .filter(Boolean);

  if (normalized.some((language) => /^en-in$/i.test(language))) {
    return "en-IN";
  }

  const englishVariant = normalized.find((language) => /^en[-_]/i.test(language));
  if (englishVariant) {
    return englishVariant.replace("_", "-");
  }

  return "en-IN";
}

function commandPhrases() {
  return [
    ...(state.config?.examples || []),
    ...(state.config?.customActions || []).map((action) => action.phrase),
    ...(state.config?.contacts || []).map((contact) => contact.displayName),
    "jarvis",
    "hey jarvis",
    "whatsapp",
    "spotify",
    "youtube",
    "chrome",
    "history",
    "commands",
    "dark mode",
    "light mode",
    "wifi",
    "bluetooth",
    "screenshot",
    "volume"
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);
}

function scoreTranscriptAlternative(transcript) {
  const normalized = normalizeText(transcript);
  if (!normalized) {
    return -1;
  }

  let score = normalized.length;
  for (const phrase of commandPhrases()) {
    if (normalized.includes(phrase)) {
      score += phrase.length * 2;
    }
  }

  if (/^(yes|no|cancel|stop|confirm|send it|go ahead)\b/.test(normalized)) {
    score += 30;
  }

  return score;
}

function bestTranscriptAlternative(result) {
  const alternatives = [];
  for (let index = 0; index < result.length; index += 1) {
    const transcript = result[index]?.transcript?.trim();
    if (transcript) {
      alternatives.push(transcript);
    }
  }

  if (!alternatives.length) {
    return "";
  }

  return alternatives.sort(
    (left, right) => scoreTranscriptAlternative(right) - scoreTranscriptAlternative(left)
  )[0];
}

function isDuplicateTranscript(transcript) {
  const normalized = normalizeText(transcript);
  const now = Date.now();
  return (
    normalized &&
    normalized === state.lastProcessedTranscript &&
    now - state.lastProcessedAt < 2000
  );
}

function rememberProcessedTranscript(transcript) {
  state.lastProcessedTranscript = normalizeText(transcript);
  state.lastProcessedAt = Date.now();
}

function stopAudioPlayback() {
  if (!state.audio) {
    return;
  }
  state.audio.onplay = null;
  state.audio.onended = null;
  state.audio.onerror = null;
  state.audio.pause();
  state.audio.currentTime = 0;
  state.audio.src = "";
  state.audio = null;
}

function abortPendingSpeechRequest() {
  if (state.speechAbortController) {
    state.speechAbortController.abort();
    state.speechAbortController = null;
  }
}

function abortPendingCommandRequest() {
  if (state.commandAbortController) {
    state.commandAbortController.abort();
    state.commandAbortController = null;
  }
}

function settleSpeechPromise() {
  if (typeof state.speechResolve === "function") {
    state.speechResolve();
  }
  state.speechResolve = null;
}

function isStopCommand(transcript) {
  const normalized = normalizeText(parseWakePhrase(transcript).command || transcript);
  return STOP_COMMAND_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isConfirmationTranscript(transcript) {
  const normalized = normalizeText(parseWakePhrase(transcript).command || transcript);
  return /^(yes|yeah|yep|confirm|go ahead|send it|do it|no|nope|cancel|don t|don't)$/i.test(
    normalized
  );
}

function rememberAssistantSpeech(text) {
  const normalized = normalizeText(text);
  state.activeAssistantSpeech = String(text || "");
  state.activeAssistantSpeechNormalized = normalized;
  state.recentAssistantSpeechNormalized = normalized;
  state.echoIgnoreUntil = Date.now() + ECHO_IGNORE_MS;
}

function clearAssistantSpeechReference() {
  if (state.activeAssistantSpeechNormalized) {
    state.recentAssistantSpeechNormalized = state.activeAssistantSpeechNormalized;
    state.echoIgnoreUntil = Date.now() + ECHO_IGNORE_MS;
  }
  state.activeAssistantSpeech = "";
  state.activeAssistantSpeechNormalized = "";
}

function transcriptMatchesSpeechReference(transcript, reference) {
  const normalizedTranscript = normalizeText(transcript);
  const normalizedReference = normalizeText(reference);
  if (!normalizedTranscript || !normalizedReference) {
    return false;
  }

  const transcriptWords = normalizedTranscript.split(" ").filter(Boolean);
  if (normalizedTranscript.length < 6 && transcriptWords.length < 2) {
    return false;
  }

  if (
    normalizedReference.includes(normalizedTranscript) ||
    normalizedTranscript.includes(normalizedReference)
  ) {
    return true;
  }

  const matchingWords = transcriptWords.filter(
    (word) => word.length >= 3 && normalizedReference.includes(word)
  );
  return matchingWords.length >= Math.max(2, Math.ceil(transcriptWords.length * 0.6));
}

function transcriptLooksLikeAssistantEcho(transcript) {
  if (isStopCommand(transcript)) {
    return false;
  }

  const references = [state.activeAssistantSpeechNormalized];
  if (Date.now() <= state.echoIgnoreUntil) {
    references.push(state.recentAssistantSpeechNormalized);
  }

  return references.some((reference) =>
    transcriptMatchesSpeechReference(transcript, reference)
  );
}

function shouldIgnoreDuringEchoTail(transcript) {
  if (!transcript || Date.now() > state.echoIgnoreUntil) {
    return false;
  }

  if (isStopCommand(transcript)) {
    return false;
  }

  const wake = parseWakePhrase(transcript);
  if (wake.wakeMatched) {
    return false;
  }

  if (state.awaitingConfirmation && isConfirmationTranscript(transcript)) {
    return false;
  }

  return true;
}

function finishSpeaking(options = {}) {
  const completeSubtitles = options.completeSubtitles !== false;
  state.speaking = false;
  clearAssistantSpeechReference();
  if (completeSubtitles) {
    finishSubtitlePlayback();
  } else {
    stopSubtitleTimers();
    state.subtitleFrames = [];
    state.subtitleFrameIndex = -1;
  }
  globe.setState({ speaking: false, listening: state.listening, awaiting: state.awaitingConfirmation });
  if (state.handsFree) {
    scheduleListeningResume(520);
  } else {
    setStatus({
      label: state.awaitingConfirmation ? "Awaiting confirmation" : "Awaiting command",
      pill: state.awaitingConfirmation ? "Confirm" : "Idle",
      note: state.awaitingConfirmation
        ? "Say yes to continue or no to cancel."
        : describeListeningMode()
    });
  }
  setMainLine(defaultHeadline());
  settleSpeechPromise();
}

function recoverFromSpeechFailure() {
  state.speaking = false;
  stopAudioPlayback();
  abortPendingSpeechRequest();
  clearAssistantSpeechReference();
  stopSubtitleTimers();
  state.subtitleFrames = [];
  state.subtitleFrameIndex = -1;
  clearListeningResume();
  globe.setState({
    speaking: false,
    listening: state.listening,
    awaiting: state.awaitingConfirmation
  });

  if (state.handsFree) {
    scheduleListeningResume(520);
  }

  setMainLine(defaultHeadline());
  state.speechResolve = null;
}

function stopAssistantOutput() {
  const wasSpeaking =
    state.speaking || Boolean(state.audio) || window.speechSynthesis.speaking;
  if (!wasSpeaking) {
    return false;
  }

  state.speechJobId += 1;
  abortPendingSpeechRequest();
  stopAudioPlayback();
  window.speechSynthesis.cancel();
  finishSpeaking({ completeSubtitles: false });
  return true;
}

function notifyServerInterrupt() {
  fetch("/api/interrupt", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    }
  }).catch(() => {});
}

function stopCurrentConversation() {
  const hadActiveWork =
    state.speaking ||
    Boolean(state.audio) ||
    window.speechSynthesis.speaking ||
    Boolean(state.commandAbortController) ||
    state.awaitingConfirmation;

  state.awaitingConfirmation = false;
  state.speechJobId += 1;
  abortPendingSpeechRequest();
  abortPendingCommandRequest();
  stopAudioPlayback();
  window.speechSynthesis.cancel();
  stopSubtitleTimers();
  state.subtitleFrames = [];
  state.subtitleFrameIndex = -1;
  clearListeningResume();
  clearAssistantSpeechReference();
  clearPendingSpeech();
  clearCommandWindow();
  clearSubtitle();
  globe.setState({
    speaking: false,
    listening: state.listening,
    awaiting: false
  });
  setMainLine(defaultHeadline());
  setStatus({
    label: state.handsFree ? "Listening" : "Awaiting command",
    pill: state.handsFree ? "Listening" : "Idle",
    note: state.handsFree
      ? describeListeningMode()
      : 'Press Start Voice once to enable the mic. After that you can say "Hey Jarvis".'
  });

  if (state.handsFree && !state.listening) {
    startListening();
  }

  settleSpeechPromise();
  notifyServerInterrupt();
  return hadActiveWork;
}

function pauseAssistant() {
  state.handsFree = false;
  dom.handsFreeToggle.checked = false;
  state.awaitingConfirmation = false;
  clearListeningResume();
  clearPendingSpeech();
  clearCommandWindow();
  abortPendingCommandRequest();
  abortPendingSpeechRequest();
  notifyServerInterrupt();
  stopAssistantOutput();
  stopListening();
  setStatus({
    label: "Voice paused",
    pill: "Paused",
    note: "Press Start Voice when you want to speak again."
  });
}

async function speakWithServerAudio(text) {
  const chunks = buildSubtitleFrames(text)
    .map((frame) => frame.text)
    .filter(Boolean);

  if (!chunks.length) {
    return;
  }

  const currentJobId = state.speechJobId + 1;
  state.speechJobId = currentJobId;

  const fetchSpeechChunk = async (chunkText) => {
    const controller = new AbortController();
    state.speechAbortController = controller;
    const timeoutId = window.setTimeout(() => {
      controller.abort(new DOMException("Timed out waiting for Kokoro audio.", "AbortError"));
    }, TTS_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify({
          text: chunkText,
          voiceMode: state.voiceMode
        })
      });

      if (!response.ok) {
        let message = "Kokoro speech is unavailable right now.";
        try {
          const payload = await response.json();
          message = payload.reply || message;
        } catch (error) {
          // Ignore JSON parse errors and use fallback message.
        }
        throw new Error(message);
      }

      return response.blob();
    } finally {
      window.clearTimeout(timeoutId);
      if (state.speechAbortController === controller) {
        state.speechAbortController = null;
      }
    }
  };

  const playSpeechChunk = async (audioBlob, chunkText, isFirstChunk) => {
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    state.audio = audio;

    return new Promise((resolve, reject) => {
      const playbackTimeoutId = window.setTimeout(() => {
        URL.revokeObjectURL(audioUrl);
        state.audio = null;
        audio.pause();
        reject(new Error("Kokoro playback took too long."));
      }, AUDIO_PLAYBACK_TIMEOUT_MS);

      const clearPlaybackTimeout = () => {
        window.clearTimeout(playbackTimeoutId);
      };

      audio.onplay = () => {
        clearPlaybackTimeout();
        clearListeningResume();
        state.speaking = true;
        rememberAssistantSpeech(chunkText);
        setSubtitle(chunkText);
        globe.setState({
          speaking: true,
          listening: state.listening,
          awaiting: state.awaitingConfirmation
        });
        setStatus({
          label: "Assistant speaking",
          pill: "Speaking",
          note: state.awaitingConfirmation
            ? "A confirmation is waiting for yes or no."
            : isFirstChunk
              ? "Jarvis is responding."
              : "Jarvis is continuing the reply."
        });
        setMainLine(state.awaitingConfirmation ? "Confirmation ready" : "Speaking now");
      };

      audio.onended = () => {
        clearPlaybackTimeout();
        URL.revokeObjectURL(audioUrl);
        state.audio = null;
        resolve();
      };

      audio.onerror = () => {
        clearPlaybackTimeout();
        URL.revokeObjectURL(audioUrl);
        state.audio = null;
        reject(new Error("Audio playback failed."));
      };

      audio.play().catch((error) => {
        clearPlaybackTimeout();
        URL.revokeObjectURL(audioUrl);
        state.audio = null;
        reject(error);
      });
    });
  };

  return new Promise(async (resolve, reject) => {
    state.speechResolve = resolve;

    try {
      for (let index = 0; index < chunks.length; index += 1) {
        const chunkText = chunks[index];
        const audioBlob = await fetchSpeechChunk(chunkText);
        if (state.speechJobId !== currentJobId) {
          return;
        }

        await playSpeechChunk(audioBlob, chunkText, index === 0);

        if (state.speechJobId !== currentJobId) {
          return;
        }
      }

      finishSpeaking();
    } catch (error) {
      if (error?.name === "AbortError") {
        finishSpeaking({ completeSubtitles: false });
        return;
      }
      recoverFromSpeechFailure();
      reject(error);
    }
  });
}

function setVoiceMode(mode) {
  state.voiceMode = mode;
  updateVoiceBadge();
  for (const button of dom.modeButtons) {
    button.classList.toggle("active", button.dataset.mode === mode);
  }
}

async function speak(text, options = {}) {
  resumeSpeechOutput();
  state.speechJobId += 1;
  abortPendingSpeechRequest();
  stopAudioPlayback();
  window.speechSynthesis.cancel();

  if (usesServerAudio()) {
    if (!state.speechUnlocked && !options.fromPending) {
      queueSpeechUntilUnlock(text);
      return;
    }

    try {
      await speakWithServerAudio(text);
      return;
    } catch (error) {
      if (isAudioUnlockError(error)) {
        state.speechUnlocked = false;
        queueSpeechUntilUnlock(text);
        return;
      }

      disableServerTts(error);
      if (!("speechSynthesis" in window)) {
        setStatus({
          label: "Speech output unavailable",
          pill: "No TTS",
          note: "Your browser does not expose speech synthesis."
        });
        setMainLine("Voice output unavailable");
        return;
      }
    }
  }

  if (!("speechSynthesis" in window)) {
    setStatus({
      label: "Speech output unavailable",
      pill: "No TTS",
      note: "Your browser does not expose speech synthesis."
    });
    return;
  }

  return new Promise((resolve) => {
    state.speechResolve = resolve;
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = currentVoice();
    if (voice) {
      utterance.voice = voice;
    }
    utterance.lang = voice?.lang || "en-US";
    utterance.volume = 1;
    utterance.rate = state.voiceMode === "female" ? 0.94 : 0.96;
    utterance.pitch = state.voiceMode === "female" ? 1.0 : 0.92;

    utterance.onstart = () => {
      clearListeningResume();
      state.speaking = true;
      rememberAssistantSpeech(text);
      startSubtitlePlayback(text, utterance.rate);
      globe.setState({
        speaking: true,
        listening: state.listening,
        awaiting: state.awaitingConfirmation
      });
      setStatus({
        label: "Assistant speaking",
        pill: "Speaking",
        note: state.awaitingConfirmation
          ? "A confirmation is waiting for yes or no."
          : "Jarvis is responding."
      });
      setMainLine(state.awaitingConfirmation ? "Confirmation ready" : "Speaking now");
    };

    utterance.onboundary = (event) => {
      if (typeof event.charIndex === "number") {
        updateSubtitlePlayback(event.charIndex);
      }
    };

    utterance.onend = () => finishSpeaking();

    utterance.onerror = () => {
      finishSpeaking({ completeSubtitles: false });
    };

    window.speechSynthesis.speak(utterance);
    window.speechSynthesis.resume();
  });
}

async function runCommand(transcript) {
  const { command, wakeMatched } = parseWakePhrase(transcript);
  const effectiveTranscript = command || transcript;

  if (wakeMatched && !command) {
    showWakeCue();
    return;
  }

  if (isStopCommand(effectiveTranscript)) {
    stopCurrentConversation();
    return;
  }

  clearPendingSpeech();
  extendCommandWindow();
  addHistory("user", effectiveTranscript);
  setMainLine(effectiveTranscript);
  setStatus({
    label: "Processing command",
    pill: "Thinking",
    note: "Jarvis is routing your request."
  });

  try {
    const controller = new AbortController();
    state.commandAbortController = controller;
    const response = await fetch("/api/command", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({ transcript: effectiveTranscript })
    });
    if (state.commandAbortController === controller) {
      state.commandAbortController = null;
    }
    const payload = await response.json();
    state.awaitingConfirmation = Boolean(payload.awaitingConfirmation);
    addHistory("assistant", payload.reply, {
      pending: state.awaitingConfirmation,
      sources: payload.sources
    });
    if (payload.uiPanel) {
      setDrawer(payload.uiPanel);
    }
    setMainLine(state.awaitingConfirmation ? "Awaiting your yes or no" : "Response ready");
    globe.setState({
      speaking: false,
      listening: state.listening,
      awaiting: state.awaitingConfirmation
    });
    await speak(payload.reply);
  } catch (error) {
    if (error?.name === "AbortError") {
      state.commandAbortController = null;
      return;
    }
    state.commandAbortController = null;
    const message = `I ran into a local error: ${error.message}`;
    addHistory("assistant", message);
    setMainLine("Local connection problem");
    await speak(message);
  }
}

function shouldProcessTranscript(transcript) {
  const { wakeMatched, command } = parseWakePhrase(transcript);
  const normalized = normalizeText(command || transcript);
  if (!normalized) {
    return wakeMatched;
  }
  if (state.awaitingConfirmation || commandWindowOpen() || wakeMatched || normalized.length >= 2) {
    return true;
  }
  return false;
}

async function maybeAutoStartListening() {
  const supportsPermissions =
    typeof navigator !== "undefined" &&
    navigator.permissions &&
    typeof navigator.permissions.query === "function";

  let permissionState = "prompt";
  if (supportsPermissions) {
    try {
      const status = await navigator.permissions.query({ name: "microphone" });
      permissionState = status.state;
    } catch (error) {
      permissionState = "prompt";
    }
  }

  if (permissionState === "granted" || userPreviouslyEnabledMic()) {
    window.setTimeout(() => {
      startListening();
    }, 240);
  }
}

function createRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    setStatus({
      label: "Voice input unavailable",
      pill: "No STT",
      note: "Use Chrome or another browser that supports the Web Speech API."
    });
    dom.startButton.disabled = true;
    return null;
  }

  const recognition = new Recognition();
  recognition.lang = preferredRecognitionLang();
  state.recognitionLang = recognition.lang;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;

  let finalTranscript = "";

  recognition.onstart = () => {
    state.listening = true;
    state.hasStartedRecognition = true;
    rememberMicPermission();
    updateRecognitionBadge();
    globe.setState({
      speaking: false,
      listening: true,
      awaiting: state.awaitingConfirmation
    });
    setStatus({
      label: state.awaitingConfirmation ? "Awaiting confirmation" : "Listening",
      pill: state.awaitingConfirmation ? "Confirm" : "Listening",
      note: describeListeningMode()
    });
  };

  recognition.onresult = async (event) => {
    const finalSegments = [];
    const interimSegments = [];
    let interimTranscript = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = bestTranscriptAlternative(result);
      if (result.isFinal) {
        if (transcript) {
          finalSegments.push(transcript);
        }
      } else {
        if (transcript) {
          interimSegments.push(transcript);
        }
      }
    }

    finalTranscript = finalSegments.join(" ").trim();
    interimTranscript = interimSegments.join(" ").trim();

    const liveTranscript = [finalTranscript, interimTranscript]
      .filter(Boolean)
      .join(" ")
      .trim();

    const liveWake = parseWakePhrase(liveTranscript);
    const liveCommand = liveWake.command || liveTranscript;

    if (state.speaking) {
      if (isStopCommand(liveCommand)) {
        stopCurrentConversation();
        finalTranscript = "";
        return;
      }
      finalTranscript = "";
      return;
    }

    if (liveTranscript && (transcriptLooksLikeAssistantEcho(liveTranscript) || shouldIgnoreDuringEchoTail(liveTranscript))) {
      if (!state.awaitingConfirmation) {
        setMainLine(defaultHeadline());
      }
      finalTranscript = "";
      return;
    }

    if (interimTranscript) {
      setMainLine(interimTranscript);
    }

    if (!finalTranscript) {
      return;
    }

    const acceptedWake = parseWakePhrase(finalTranscript);
    const acceptedTranscript = acceptedWake.command || finalTranscript;
    finalTranscript = "";
    if (!shouldProcessTranscript(acceptedTranscript)) {
      setMainLine(defaultHeadline());
      return;
    }

    if (acceptedWake.wakeMatched && !acceptedWake.command) {
      showWakeCue();
      return;
    }

    if (isDuplicateTranscript(acceptedTranscript)) {
      return;
    }
    rememberProcessedTranscript(acceptedTranscript);

    await runCommand(acceptedTranscript);
  };

  recognition.onerror = (event) => {
    state.listening = false;
    updateRecognitionBadge();
    globe.setState({
      speaking: state.speaking,
      listening: false,
      awaiting: state.awaitingConfirmation
    });
    if (!state.speaking && !state.awaitingConfirmation) {
      clearSubtitle();
    }

    if (
      state.handsFree &&
      event?.error !== "not-allowed" &&
      event?.error !== "service-not-allowed" &&
      !state.speaking
    ) {
      scheduleListeningResume(900);
    }
  };

  recognition.onend = () => {
    state.listening = false;
    updateRecognitionBadge();
    globe.setState({
      speaking: state.speaking,
      listening: false,
      awaiting: state.awaitingConfirmation
    });

    if (state.handsFree && !state.speaking) {
      scheduleListeningResume(420);
    }
  };

  return recognition;
}

function startListening(allowDuringSpeech = false) {
  if (!state.recognition || state.listening) {
    return;
  }
  if (state.speaking && !allowDuringSpeech) {
    return;
  }
  try {
    state.recognition.start();
  } catch (error) {
    // Browsers throw if start is called while already active.
  }
}

function stopListening() {
  if (!state.recognition || !state.listening) {
    return;
  }
  state.recognition.stop();
}

function bindEvents() {
  const unlockOnInteraction = () => {
    unlockSpeech();
  };

  document.addEventListener("pointerdown", unlockOnInteraction, { passive: true });
  document.addEventListener("keydown", unlockOnInteraction);

  window.setInterval(() => {
    if (
      state.handsFree &&
      state.recognition &&
      !state.speaking &&
      !state.listening
    ) {
      startListening();
    }
  }, LISTENING_WATCHDOG_MS);

  dom.startButton.addEventListener("click", () => {
    unlockSpeech();
    rememberMicPermission();
    extendCommandWindow();
    startListening();
  });
  dom.dockStartButton.addEventListener("click", () => {
    unlockSpeech();
    rememberMicPermission();
    extendCommandWindow();
    startListening();
  });
  dom.stopButton.addEventListener("click", () => {
    pauseAssistant();
  });
  dom.dockStopButton.addEventListener("click", () => {
    unlockSpeech();
    pauseAssistant();
  });

  dom.handsFreeToggle.addEventListener("change", (event) => {
    state.handsFree = event.target.checked;
    if (state.handsFree) {
      extendCommandWindow();
      startListening();
    } else {
      clearCommandWindow();
    }
  });

  dom.textCommandForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    unlockSpeech();
    const transcript = dom.textCommand.value.trim();
    if (!transcript) {
      return;
    }
    dom.textCommand.value = "";
    await runCommand(transcript);
  });

  dom.dockTextCommandForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    unlockSpeech();
    const transcript = dom.dockTextCommand.value.trim();
    if (!transcript) {
      return;
    }
    dom.dockTextCommand.value = "";
    await runCommand(transcript);
  });

  dom.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      unlockSpeech();
      setVoiceMode(button.dataset.mode);
    });
  });

  dom.closeDrawerButton.addEventListener("click", () => {
    unlockSpeech();
    setDrawer("none");
  });
}

function renderQuickCommands() {
  dom.quickCommands.innerHTML = "";
  const commands = [
    ...(state.config?.examples || []),
    ...(state.config?.customActions || []).map((action) => action.phrase)
  ].slice(0, 8);

  for (const command of commands) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.textContent = command;
    button.addEventListener("click", () => {
      unlockSpeech();
      void runCommand(command);
    });
    dom.quickCommands.append(button);
  }
}

class GlobeAnimation {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.points = this.createSpherePoints(240);
    this.state = {
      listening: false,
      speaking: false,
      awaiting: false
    };
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.frame = null;
    this.tick = this.tick.bind(this);
    this.frame = window.requestAnimationFrame(this.tick);
  }

  createSpherePoints(count) {
    const points = [];
    const offset = 2 / count;
    const increment = Math.PI * (3 - Math.sqrt(5));
    for (let index = 0; index < count; index += 1) {
      const y = index * offset - 1 + offset / 2;
      const radius = Math.sqrt(1 - y * y);
      const angle = index * increment;
      points.push({
        x: Math.cos(angle) * radius,
        y,
        z: Math.sin(angle) * radius
      });
    }
    return points;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(300, rect.width * dpr);
    this.canvas.height = Math.max(300, rect.height * dpr);
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
    this.width = rect.width;
    this.height = rect.height;
    this.radius = Math.min(rect.width, rect.height) * 0.26;
  }

  setState(nextState) {
    this.state = { ...this.state, ...nextState };
  }

  tick(timestamp) {
    this.draw(timestamp);
    this.frame = window.requestAnimationFrame(this.tick);
  }

  draw(timestamp) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    const cx = this.width / 2;
    const cy = this.height / 2;
    const t = timestamp * 0.00055;
    const energy =
      0.26 +
      (this.state.listening ? 0.24 : 0) +
      (this.state.speaking ? 0.42 : 0) +
      (this.state.awaiting ? 0.12 : 0);
    const pulse = this.state.speaking
      ? 0.5 + 0.5 * Math.sin(timestamp * 0.014)
      : this.state.listening
        ? 0.5 + 0.5 * Math.sin(timestamp * 0.008)
        : 0.35;

    const glow = ctx.createRadialGradient(cx, cy, this.radius * 0.15, cx, cy, this.radius * 2.4);
    glow.addColorStop(0, `rgba(121, 241, 255, ${0.28 + pulse * 0.18})`);
    glow.addColorStop(0.5, `rgba(32, 216, 255, ${0.08 + pulse * 0.1})`);
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, this.radius * 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = `rgba(121, 241, 255, ${0.18 + energy * 0.2})`;
    ctx.lineWidth = 1;
    for (let ring = 0; ring < 3; ring += 1) {
      ctx.beginPath();
      const ringRadius = this.radius * (1.16 + ring * 0.19 + pulse * 0.02);
      ctx.ellipse(0, 0, ringRadius, ringRadius * (0.34 + ring * 0.05), t + ring, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    const projected = [];
    for (const point of this.points) {
      const rotatedY = rotateY(point, t * 1.2);
      const rotatedXY = rotateX(rotatedY, Math.sin(t * 0.7) * 0.55);
      const depth = 2.3 + rotatedXY.z;
      const scale = this.radius / depth;
      projected.push({
        x: cx + rotatedXY.x * scale * 1.85,
        y: cy + rotatedXY.y * scale * 1.85,
        size: (1.3 + rotatedXY.z * 1.2 + pulse * 0.8) * (0.9 + energy),
        alpha: 0.22 + ((rotatedXY.z + 1) / 2) * 0.75
      });
    }

    projected.sort((left, right) => left.alpha - right.alpha);

    for (let index = 0; index < projected.length; index += 1) {
      const point = projected[index];
      if (index < projected.length - 11 && index % 8 === 0) {
        const nextPoint = projected[index + 8];
        ctx.strokeStyle = `rgba(58, 242, 196, ${Math.min(point.alpha, nextPoint.alpha) * 0.18})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(nextPoint.x, nextPoint.y);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(121, 241, 255, ${point.alpha})`;
      ctx.beginPath();
      ctx.arc(point.x, point.y, Math.max(0.8, point.size), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function rotateY(point, angle) {
  return {
    x: point.x * Math.cos(angle) - point.z * Math.sin(angle),
    y: point.y,
    z: point.x * Math.sin(angle) + point.z * Math.cos(angle)
  };
}

function rotateX(point, angle) {
  return {
    x: point.x,
    y: point.y * Math.cos(angle) - point.z * Math.sin(angle),
    z: point.y * Math.sin(angle) + point.z * Math.cos(angle)
  };
}

async function loadConfig() {
  const response = await fetch("/api/config");
  state.config = await response.json();
  state.serverTtsDisabled = state.config?.tts?.available === false;
  state.serverTtsError = state.config?.tts?.error || "";
  dom.assistantName.textContent = state.config.assistantName;
  updateVoiceBadge();
  updateVoiceLockSummary();
  renderQuickCommands();

  addHistory(
    "assistant",
    `${state.config.assistantName} is ready for ${state.config.user?.displayName || "you"}.`
  );
  setMainLine(defaultHeadline());
}

async function boot() {
  bindEvents();
  setVoiceMode("female");
  setStatus({
    label: "Initializing",
    pill: "Booting",
    note: "Loading the local assistant shell."
  });

  await loadConfig();
  collectVoices();
  window.speechSynthesis.addEventListener("voiceschanged", collectVoices);
  state.recognition = createRecognition();
  await maybeAutoStartListening();
  setStatus({
    label: "Awaiting command",
    pill: "Idle",
    note: 'Press Start Voice once to grant microphone access. After that Jarvis can reconnect automatically, and you can wake it with "Hey Jarvis".'
  });
}

const globe = new GlobeAnimation(dom.canvas);
boot();
