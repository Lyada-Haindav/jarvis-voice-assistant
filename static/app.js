const state = {
  config: null,
  speaking: false,
  listening: false,
  handsFree: true,
  awaitingConfirmation: false,
  awaitingSelection: false,
  conversationLanguage: "english",
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
  recognitionRestartPending: false,
  micPausedForAssistantSpeech: false,
  allowBargeIn: true,
  bargeInActive: false,
  serverTtsDisabled: false,
  serverTtsError: "",
  cloudConfig: null,
  localAgentBaseUrl: "",
  localAgentConnected: false,
  desktopEnvironment: null,
  desktopPermissions: null,
  desktopWindowState: null,
  desktopSetupPrompted: false,
  compactMode: false,
  compactExpanded: false,
  menuBarOnlyMode: false,
  voiceSessionEnabled: false,
  localSpeechStream: null,
  localSpeechContext: null,
  localSpeechSource: null,
  localSpeechProcessor: null,
  localSpeechCompressor: null,
  localSpeechGain: null,
  localSpeechActive: false,
  localSpeechBuffers: [],
  localSpeechPreRoll: [],
  localSpeechLastVoiceAt: 0,
  localSpeechStartedAt: 0,
  localSpeechRequestInFlight: false,
  localSpeechConsecutiveLoudFrames: 0,
  localSpeechNoiseFloor: 0,
  localSpeechNoiseSamples: 0,
  localSpeechCalibrationUntil: 0,
  overlaySyncTimeout: null
};

const dom = {
  heroPanel: document.querySelector(".hero-panel"),
  desktopTitlebar: document.querySelector("#desktopTitlebar"),
  desktopWindowTitle: document.querySelector("#desktopWindowTitle"),
  windowMinimizeButton: document.querySelector("#windowMinimizeButton"),
  windowMaximizeButton: document.querySelector("#windowMaximizeButton"),
  windowCloseButton: document.querySelector("#windowCloseButton"),
  assistantName: document.querySelector("#assistantName"),
  statusPill: document.querySelector("#statusPill"),
  heroModeBadge: document.querySelector("#heroModeBadge"),
  heroStatusBadge: document.querySelector("#heroStatusBadge"),
  heroRecognitionBadge: document.querySelector("#heroRecognitionBadge"),
  dynamicIslandToggle: document.querySelector("#dynamicIslandToggle"),
  desktopSetupToggle: document.querySelector("#desktopSetupToggle"),
  desktopVoiceToggle: document.querySelector("#desktopVoiceToggle"),
  desktopCommandsToggle: document.querySelector("#desktopCommandsToggle"),
  desktopHistoryToggle: document.querySelector("#desktopHistoryToggle"),
  desktopSetupCard: document.querySelector("#desktopSetupCard"),
  desktopSetupBadge: document.querySelector("#desktopSetupBadge"),
  desktopPermissionList: document.querySelector("#desktopPermissionList"),
  desktopMicButton: document.querySelector("#desktopMicButton"),
  desktopAccessibilityButton: document.querySelector("#desktopAccessibilityButton"),
  desktopAutomationButton: document.querySelector("#desktopAutomationButton"),
  desktopRefreshButton: document.querySelector("#desktopRefreshButton"),
  desktopLaunchAtLogin: document.querySelector("#desktopLaunchAtLogin"),
  desktopSetupNote: document.querySelector("#desktopSetupNote"),
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

function speechSynthesisApi() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }
  return window.speechSynthesis;
}

function browserRecognitionConstructor() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function desktopBridge() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.JarvisDesktop || null;
}

function isDesktopApp() {
  return Boolean(desktopBridge()?.isDesktopApp);
}

function desktopOverlayBridgeAvailable() {
  return Boolean(isDesktopApp() && desktopBridge()?.updateOverlayState);
}

function preferredRecognitionEngineKind() {
  const hasMicCapture =
    isDesktopApp() &&
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function";
  const hasBrowserRecognition = Boolean(browserRecognitionConstructor());
  const activeLanguage = activeConversationLanguage();

  if (hasMicCapture && backgroundWakeModeActive()) {
    return "local";
  }

  if (activeLanguage === "english" && hasBrowserRecognition) {
    return "browser";
  }

  if (hasMicCapture) {
    return "local";
  }

  return hasBrowserRecognition ? "browser" : "none";
}

function shouldUseLocalSpeechRecognition() {
  return preferredRecognitionEngineKind() === "local";
}

function disposeRecognition(recognition) {
  if (!recognition) {
    return;
  }

  if (recognition.kind === "local") {
    stopLocalSpeechCapture();
    return;
  }

  try {
    recognition.stop();
  } catch (error) {
    // Ignore stop errors during engine switches.
  }
}

function shouldUseBrowserSpeechRecognition() {
  return (
    preferredRecognitionEngineKind() === "browser"
  );
}

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
  /^enough$/i,
  /^रुको$/u,
  /^बस$/u,
  /^ఆపు$/u,
  /^చాలు$/u
];

const WAKE_COMMAND_PATTERNS = [
  /^(?:hey|hi|hello|namaste)\s+jarvis\b[\s,:.!-]*(.*)$/i,
  /^jarvis\b[\s,:.!-]*(.*)$/i,
  /^(?:हे|हाय|हेलो|नमस्ते)\s+जार्विस\b[\s,:.!-]*(.*)$/u,
  /^जार्विस\b[\s,:.!-]*(.*)$/u,
  /^(?:హే|హాయ్|నమస్తే)\s+జార్విస్\b[\s,:.!-]*(.*)$/u,
  /^జార్విస్\b[\s,:.!-]*(.*)$/u
];

const COMMAND_TRANSCRIPT_REPLACEMENTS = [
  [/\b(?:jervis|jarviss|jarvish|jarviz|jarbis|jarviss|jai\s*risa|jairis|jarves)\b/gi, "jarvis"],
  [/\b(?:rvc|r v c)\b/gi, "jarvis"],
  [/\b(?:you\s*to\s*you|you\s*tube|yu\s*tube|u\s*tube|yoo\s*toob|youtoob|utub|yutuub)\b/gi, "youtube"],
  [/\b(?:whats?\s*up|watts?\s*app|wattsapp|watsapp|vatsap|vatsapp)\b/gi, "whatsapp"],
  [/\b(?:spot\s*if\s*i|spoti\s*fi|spatify|spotyfy)\b/gi, "spotify"],
  [/\b(?:khol(?:o|do)?|kholiye|teruvu|teravandi|cheyyi|cheyi|open\s*cheyyi|open\s*cheyi)\b/gi, "open"],
  [/\b(?:bhejo|bhejna|pampu|pampinchu|send\s*cheyyi)\b/gi, "send"],
  [/\b(?:kal\b)/gi, "tomorrow"],
  [/\b(?:aaj\b)/gi, "today"]
];

const COMMAND_WINDOW_MS = 45000;
const ECHO_IGNORE_MS = 3200;
const LISTENING_WATCHDOG_MS = 1400;
const TTS_REQUEST_TIMEOUT_MS = 90000;
const AUDIO_PLAYBACK_TIMEOUT_MS = 12000;
const LOCAL_SPEECH_CHUNK_SIZE = 1024;
const LOCAL_SPEECH_THRESHOLD = 0.005;
const LOCAL_SPEECH_MIN_FRAMES = 1;
const LOCAL_SPEECH_MIN_MS = 80;
const LOCAL_SPEECH_SILENCE_MS = 380;
const LOCAL_SPEECH_MAX_MS = 3600;
const LOCAL_SPEECH_PRE_ROLL_CHUNKS = 4;
const LOCAL_SPEECH_NOISE_MULTIPLIER = 2.25;
const LOCAL_SPEECH_NOISE_SMOOTHING = 0.1;
const LOCAL_SPEECH_PEAK_THRESHOLD = 0.02;
const LOCAL_SPEECH_NOISE_CEILING = 0.028;
const LOCAL_SPEECH_CALIBRATION_MS = 320;
const MIC_PERMISSION_KEY = "jarvis-mic-enabled";
const COMPACT_MODE_KEY = "jarvis-compact-mode";
const VOICE_SESSION_KEY = "jarvis-voice-session-enabled";
const MENU_BAR_ONLY_KEY = "jarvis-menu-bar-only";
const DEVANAGARI_SCRIPT_REGEX = /[\u0900-\u097F]/u;
const TELUGU_SCRIPT_REGEX = /[\u0C00-\u0C7F]/u;

function quickSummonShortcutLabel() {
  if (state.desktopEnvironment?.quickSummonShortcut) {
    return state.desktopEnvironment.quickSummonShortcut;
  }
  if (!isDesktopApp()) {
    return "";
  }
  return state.desktopEnvironment?.platform === "win32" ? "Alt+Space" : "Option+Space";
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function repairRecognizedTranscript(text) {
  const original = String(text || "").trim();
  if (!original) {
    return "";
  }

  let repaired = original;
  for (const [pattern, replacement] of COMMAND_TRANSCRIPT_REPLACEMENTS) {
    repaired = repaired.replace(pattern, replacement);
  }

  return repaired.replace(/\s+/g, " ").trim() || original;
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function activeApiBaseUrl() {
  return state.localAgentConnected ? trimTrailingSlash(state.localAgentBaseUrl) : "";
}

function apiUrlForBase(baseUrl, path) {
  return `${trimTrailingSlash(baseUrl)}${path}`;
}

function apiUrl(path) {
  const baseUrl = activeApiBaseUrl();
  return apiUrlForBase(baseUrl, path);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let message = `Request failed with status ${response.status}.`;
    try {
      const payload = await response.json();
      message = payload.reply || payload.message || message;
    } catch (error) {
      // Ignore response parse failures and keep the fallback message.
    }
    throw new Error(message);
  }
  return response.json();
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 1500) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort(new DOMException("Timed out waiting for the local device helper.", "AbortError"));
  }, timeoutMs);

  try {
    return await fetchJson(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function mergeConfigs(cloudConfig, localConfig) {
  return {
    ...cloudConfig,
    ...localConfig,
    deployment: cloudConfig?.deployment || localConfig?.deployment,
    localAgent: {
      ...(cloudConfig?.localAgent || {}),
      ...(localConfig?.localAgent || {}),
      connected: state.localAgentConnected
    }
  };
}

async function connectLocalAgent(cloudConfig) {
  const configuredBaseUrl = trimTrailingSlash(cloudConfig?.localAgent?.baseUrl || "");
  state.localAgentBaseUrl = configuredBaseUrl;

  if (
    !cloudConfig?.localAgent?.enabled ||
    !configuredBaseUrl ||
    cloudConfig?.deployment?.mode === "agent"
  ) {
    state.localAgentConnected = false;
    return cloudConfig;
  }

  try {
    await fetchJsonWithTimeout(`${configuredBaseUrl}/api/status`, {}, 1200);
    const localConfig = await fetchJsonWithTimeout(`${configuredBaseUrl}/api/config`, {}, 1600);
    state.localAgentConnected = true;
    return mergeConfigs(cloudConfig, localConfig);
  } catch (error) {
    state.localAgentConnected = false;
    return cloudConfig;
  }
}

function detectScriptLanguage(text) {
  const raw = String(text || "");
  if (TELUGU_SCRIPT_REGEX.test(raw)) {
    return "telugu";
  }
  if (DEVANAGARI_SCRIPT_REGEX.test(raw)) {
    return "hindi";
  }
  return /[a-z]/i.test(raw) ? "english" : null;
}

function normalizeConversationLanguage(value) {
  const raw = String(value || "").trim();
  const normalized = normalizeText(raw);

  if (
    normalized === "auto" ||
    normalized === "automatic" ||
    normalized === "default"
  ) {
    return "auto";
  }

  if (
    normalized === "english" ||
    normalized === "en" ||
    /\benglish\b/.test(normalized)
  ) {
    return "english";
  }

  if (
    normalized === "hindi" ||
    normalized === "hi" ||
    /हिंदी|हिन्दी/u.test(raw) ||
    /\bhindi\b/.test(normalized)
  ) {
    return "hindi";
  }

  if (
    normalized === "telugu" ||
    normalized === "te" ||
    /తెలుగు/u.test(raw) ||
    /\btelugu\b/.test(normalized)
  ) {
    return "telugu";
  }

  return null;
}

function conversationLanguageCode(language) {
  switch (normalizeConversationLanguage(language)) {
    case "hindi":
      return "hi-IN";
    case "telugu":
      return "te-IN";
    case "english":
      return "en-IN";
    default:
      return "auto";
  }
}

function conversationLanguageLabel(language) {
  switch (normalizeConversationLanguage(language)) {
    case "hindi":
      return "Hindi";
    case "telugu":
      return "Telugu";
    case "english":
      return "English";
    default:
      return "Auto";
  }
}

function browserPreferredRecognitionLang() {
  const languages = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language || "en-IN"];
  const normalized = languages
    .map((language) => String(language || "").trim())
    .filter(Boolean);

  const preferredIndian = normalized.find((language) => /^(te|hi|en)(-|_)/i.test(language));
  if (preferredIndian) {
    if (/^te/i.test(preferredIndian)) {
      return "te-IN";
    }
    if (/^hi/i.test(preferredIndian)) {
      return "hi-IN";
    }
    if (/^en-in$/i.test(preferredIndian)) {
      return "en-IN";
    }
    if (/^en[-_]/i.test(preferredIndian)) {
      return preferredIndian.replace("_", "-");
    }
  }

  const englishVariant = normalized.find((language) => /^en[-_]/i.test(language));
  if (englishVariant) {
    return englishVariant.replace("_", "-");
  }

  return "en-IN";
}

function activeConversationLanguage() {
  return normalizeConversationLanguage(state.conversationLanguage) || "auto";
}

function speechLanguageForText(text, explicitLanguage) {
  const requested = normalizeConversationLanguage(explicitLanguage);
  if (requested && requested !== "auto") {
    return requested;
  }

  const detected = detectScriptLanguage(text);
  if (detected) {
    return detected;
  }

  const activeLanguage = activeConversationLanguage();
  return activeLanguage === "auto" ? "english" : activeLanguage;
}

function serverProviderForLanguage(language) {
  const normalizedLanguage = normalizeConversationLanguage(language) || "english";
  const configured = state.config?.tts?.languageProviders?.[normalizedLanguage];

  if (normalizedLanguage === "english") {
    return usesServerAudio() ? activeTtsProvider() : configured || "browser";
  }

  return configured || "browser";
}

function shouldUseBrowserSpeech(text, explicitLanguage) {
  const language = speechLanguageForText(text, explicitLanguage);
  return !["kokoro_server", "gemini_tts"].includes(serverProviderForLanguage(language));
}

function hasServerAudioForLanguage(language) {
  return ["kokoro_server", "gemini_tts"].includes(serverProviderForLanguage(language));
}

function extendCommandWindow(durationMs = COMMAND_WINDOW_MS) {
  state.commandWindowUntil = Date.now() + durationMs;
}

function clearCommandWindow() {
  state.commandWindowUntil = 0;
}

function commandWindowOpen() {
  return state.awaitingConfirmation || state.awaitingSelection || Date.now() < state.commandWindowUntil;
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

function rememberVoiceSessionPreference(enabled) {
  try {
    window.localStorage.setItem(VOICE_SESSION_KEY, enabled ? "1" : "0");
  } catch (error) {
    // Ignore storage failures in locked-down contexts.
  }
}

function preferredVoiceSessionEnabled() {
  try {
    return window.localStorage.getItem(VOICE_SESSION_KEY) === "1";
  } catch (error) {
    return false;
  }
}

function rememberMenuBarOnlyPreference(enabled) {
  try {
    window.localStorage.setItem(MENU_BAR_ONLY_KEY, enabled ? "1" : "0");
  } catch (error) {
    // Ignore storage failures in locked-down contexts.
  }
}

function preferredMenuBarOnlyMode() {
  try {
    return window.localStorage.getItem(MENU_BAR_ONLY_KEY) === "1";
  } catch (error) {
    return false;
  }
}

function windowFocused() {
  return typeof document !== "undefined" && typeof document.hasFocus === "function"
    ? document.hasFocus()
    : true;
}

function backgroundWakeModeActive() {
  if (!isDesktopApp()) {
    return false;
  }

  return Boolean(document.hidden || !windowFocused());
}

function parseWakePhrase(transcript) {
  const raw = repairRecognizedTranscript(transcript);
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
  const recognitionLabel =
    conversationLanguageLabel(
      state.recognitionLang === "hi-IN"
        ? "hindi"
        : state.recognitionLang === "te-IN"
          ? "telugu"
          : "english"
    ) || state.recognitionLang;

  if (state.awaitingSelection) {
    return "Say the number or the contact name you want.";
  }

  if (state.awaitingConfirmation) {
    return "Say yes to continue or no to cancel.";
  }

  if (commandWindowOpen()) {
    return `Jarvis is awake. Speak your command now. Recognition is tuned for ${recognitionLabel}.`;
  }

  const shortcut = quickSummonShortcutLabel();
  const shortcutNote = shortcut ? ` Press ${shortcut} to summon Jarvis instantly.` : "";
  return `Say "Hey Jarvis" to wake, or just start with "Jarvis". Recognition is tuned for ${recognitionLabel}.${shortcutNote}`;
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
    if (!state.speaking && !state.awaitingConfirmation && !state.awaitingSelection) {
      clearSubtitle();
    }
    state.subtitleHideTimeout = null;
  }, 1400);
}

function historySpeakerLabel(role) {
  return role === "assistant" ? state.config?.assistantName || "Jarvis" : "You";
}

function renderHistorySources(message, entry) {
  const existing = message.querySelector(".message-sources");
  existing?.remove();

  if (entry.role !== "assistant" || !Array.isArray(entry.sources) || !entry.sources.length) {
    return;
  }

  const sourcesWrap = document.createElement("div");
  sourcesWrap.className = "message-sources";

  const label = document.createElement("span");
  label.className = "message-source-label";
  label.textContent = "Sources";
  sourcesWrap.append(label);

  for (const source of entry.sources) {
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

function createHistoryMessageElement(entry) {
  const message = document.createElement("div");
  message.className = `message ${entry.role}${entry.pending ? " pending" : ""}`;

  const heading = document.createElement("strong");
  heading.textContent = historySpeakerLabel(entry.role);

  const paragraph = document.createElement("p");
  paragraph.textContent = entry.text;

  message.append(heading, paragraph);
  renderHistorySources(message, entry);

  entry.element = message;
  entry.textElement = paragraph;
  return message;
}

function updateHistoryEntry(entry, text, options = {}) {
  if (!entry) {
    return;
  }

  entry.text = String(text || "").trim();
  if ("pending" in options) {
    entry.pending = Boolean(options.pending);
  }
  if ("sources" in options) {
    entry.sources = Array.isArray(options.sources) ? options.sources : [];
  }

  if (entry.element) {
    entry.element.className = `message ${entry.role}${entry.pending ? " pending" : ""}`;
    if (entry.textElement) {
      entry.textElement.textContent = entry.text;
    }
    renderHistorySources(entry.element, entry);
  }

  if (state.drawerMode === "history") {
    renderDrawer();
  }
}

function addHistory(role, text, options = {}) {
  const entry = {
    role,
    text,
    pending: Boolean(options.pending),
    sources: Array.isArray(options.sources) ? options.sources : []
  };

  state.historyEntries.unshift(entry);
  if (state.historyEntries.length > 40) {
    state.historyEntries.length = 40;
  }

  dom.history.prepend(createHistoryMessageElement(entry));

  if (state.drawerMode === "history") {
    renderDrawer();
  }

  return entry;
}

function openClientUrl(url, action = {}) {
  if (!url) {
    return;
  }

  const target = action.target || "_blank";
  let popup = null;
  try {
    popup = window.open(url, target, "noopener,noreferrer");
  } catch (error) {
    popup = null;
  }

  if (popup || target === "_self") {
    return;
  }

  const link = document.createElement("a");
  link.href = url;
  link.target = target;
  link.rel = "noopener noreferrer";
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();

  if (action.fallbackTarget === "_self") {
    window.setTimeout(() => {
      if (document.visibilityState === "visible") {
        window.location.assign(url);
      }
    }, 180);
  }
}

function runClientActions(actions) {
  if (!Array.isArray(actions) || !actions.length) {
    return;
  }

  for (const action of actions) {
    if (!action || !action.type) {
      continue;
    }
    if (action.type === "open_url") {
      openClientUrl(action.url, action);
    }
  }
}

function permissionSummary(label, status) {
  const normalized = String(status || "unknown");
  if (normalized === "granted") {
    return `${label}: granted`;
  }
  if (normalized === "not_granted" || normalized === "denied" || normalized === "restricted") {
    return `${label}: needs approval`;
  }
  if (normalized === "requires_manual_enable") {
    return `${label}: enable in system settings`;
  }
  if (normalized === "not-determined") {
    return `${label}: not requested yet`;
  }
  return `${label}: ${normalized.replace(/_/g, " ")}`;
}

function desktopPermissionState() {
  const permissions = state.desktopPermissions || {};
  const microphoneReady = permissions.microphone === "granted";
  const accessibilityReady = permissions.accessibility === "granted";
  const automationReady = permissions.automation === "granted";

  return {
    permissions,
    microphoneReady,
    accessibilityReady,
    automationReady,
    allReady: microphoneReady && accessibilityReady && automationReady
  };
}

function syncDrawerToggles() {
  const toggles = [
    [dom.desktopSetupToggle, "setup"],
    [dom.desktopVoiceToggle, "voice"],
    [dom.desktopCommandsToggle, "commands"],
    [dom.desktopHistoryToggle, "history"]
  ];

  for (const [button, mode] of toggles) {
    if (!button) {
      continue;
    }
    const active = state.drawerMode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

function createDrawerAction(label, handler, options = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  if (options.primary) {
    button.classList.add("primary");
  }
  if (options.disabled) {
    button.disabled = true;
  }
  button.addEventListener("click", async () => {
    unlockSpeech();
    await handler();
    if (state.drawerMode !== "none") {
      renderDrawer();
    }
  });
  return button;
}

function createDrawerMetric(title, status, note, actions = []) {
  const card = document.createElement("div");
  card.className = "drawer-metric";

  const heading = document.createElement("strong");
  heading.className = "drawer-metric-title";
  heading.textContent = title;

  const statusText = document.createElement("span");
  statusText.className = "drawer-metric-status";
  statusText.textContent = status;

  const noteText = document.createElement("p");
  noteText.className = "drawer-metric-note";
  noteText.textContent = note;

  card.append(heading, statusText, noteText);

  if (actions.length) {
    const row = document.createElement("div");
    row.className = "drawer-button-row";
    for (const action of actions) {
      row.append(action);
    }
    card.append(row);
  }

  return card;
}

function createDrawerSwitch(label, checked, onChange, note = "") {
  const block = document.createElement("label");
  block.className = "drawer-switch";

  const copy = document.createElement("div");
  copy.className = "drawer-switch-copy";

  const title = document.createElement("strong");
  title.textContent = label;
  copy.append(title);

  if (note) {
    const hint = document.createElement("p");
    hint.textContent = note;
    copy.append(hint);
  }

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(checked);
  input.addEventListener("change", async (event) => {
    unlockSpeech();
    await onChange(event.target.checked);
    if (state.drawerMode !== "none") {
      renderDrawer();
    }
  });

  block.append(copy, input);
  return block;
}

function renderDesktopSetup() {
  if (!dom.desktopSetupCard) {
    return;
  }

  if (!isDesktopApp()) {
    document.body.classList.remove("desktop-app");
    if (dom.desktopTitlebar) {
      dom.desktopTitlebar.hidden = true;
    }
    dom.desktopSetupCard.hidden = true;
    if (dom.heroModeBadge) {
      dom.heroModeBadge.textContent = state.localAgentConnected ? "Local device" : "Browser mode";
    }
    if (dom.desktopSetupToggle) {
      dom.desktopSetupToggle.classList.remove("attention");
    }
    syncDrawerToggles();
    return;
  }

  document.body.classList.add("desktop-app");
  if (dom.desktopTitlebar) {
    dom.desktopTitlebar.hidden = false;
  }
  dom.desktopSetupCard.hidden = true;
  const platform = state.desktopEnvironment?.platform || "desktop";
  dom.desktopSetupBadge.textContent = platform.toUpperCase();
  if (dom.desktopWindowTitle) {
    dom.desktopWindowTitle.textContent = state.config?.assistantName || "Jarvis";
  }
  if (dom.desktopLaunchAtLogin) {
    dom.desktopLaunchAtLogin.checked = Boolean(state.desktopEnvironment?.launchAtLogin);
  }

  const { permissions, microphoneReady, accessibilityReady, allReady } = desktopPermissionState();
  const items = [
    permissionSummary("Microphone", permissions.microphone),
    permissionSummary("Accessibility", permissions.accessibility),
    permissionSummary("Automation", permissions.automation)
  ];

  dom.desktopPermissionList.innerHTML = "";
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "desktop-permission-item";
    row.textContent = item;
    dom.desktopPermissionList.append(row);
  }

  dom.desktopMicButton.disabled = microphoneReady;
  dom.desktopAccessibilityButton.disabled = accessibilityReady;
  dom.desktopSetupNote.textContent =
    platform === "darwin"
      ? `Grant microphone first. For Accessibility and Automation, macOS may open System Settings and ask you to enable Jarvis manually. Closing the window keeps Jarvis in the menu bar, and ${quickSummonShortcutLabel()} brings it back instantly.`
      : "Grant the permissions your system requests on first use so Jarvis can use voice and native controls on this laptop. Closing the window keeps Jarvis running in the tray.";

  if (dom.heroModeBadge) {
    dom.heroModeBadge.textContent = `${platform.toUpperCase()} device`;
  }
  if (dom.desktopSetupToggle) {
    dom.desktopSetupToggle.classList.toggle("attention", !allReady);
    dom.desktopSetupToggle.title = allReady
      ? "Desktop setup is ready on this laptop."
      : "Finish desktop permissions on this laptop.";
  }

  if (!allReady && !state.desktopSetupPrompted && state.drawerMode === "none") {
    state.desktopSetupPrompted = true;
    setDrawer("setup");
  } else {
    syncDrawerToggles();
  }
}

async function refreshDesktopEnvironment() {
  if (!isDesktopApp()) {
    renderDesktopSetup();
    return;
  }

  try {
    const environment = await desktopBridge().getEnvironment();
    state.desktopEnvironment = environment || null;
    state.desktopPermissions = environment?.permissions || null;
    state.menuBarOnlyMode = Boolean(environment?.menuBarOnlyMode);
  } catch (error) {
    state.desktopEnvironment = {
      platform: "desktop",
      launchAtLogin: false
    };
    state.desktopPermissions = {
      microphone: "unknown",
      accessibility: "unknown",
      automation: "unknown"
    };
    state.menuBarOnlyMode = false;
  }

  renderDesktopSetup();
}

async function setDesktopLaunchAtLogin(enabled) {
  if (!isDesktopApp()) {
    return;
  }

  try {
    const environment = await desktopBridge().setLaunchAtLogin(Boolean(enabled));
    state.desktopEnvironment = {
      ...(state.desktopEnvironment || {}),
      ...(environment || {})
    };
    state.desktopPermissions = environment?.permissions || state.desktopPermissions;
  } catch (error) {
    // Ignore login-item failures and keep the current state visible.
  }

  renderDesktopSetup();
}

async function setMenuBarOnlyMode(enabled) {
  if (!isDesktopApp() || !desktopBridge().setMenuBarOnly) {
    return;
  }

  const nextValue = Boolean(enabled);
  rememberMenuBarOnlyPreference(nextValue);

  try {
    const environment = await desktopBridge().setMenuBarOnly(nextValue);
    state.desktopEnvironment = {
      ...(state.desktopEnvironment || {}),
      ...(environment || {})
    };
    state.menuBarOnlyMode = Boolean(environment?.menuBarOnlyMode ?? nextValue);
    state.desktopPermissions = environment?.permissions || state.desktopPermissions;
  } catch (error) {
    state.menuBarOnlyMode = nextValue;
  }

  renderDesktopSetup();
  syncRecognitionEngineForContext();
}

async function refreshDesktopWindowState() {
  if (!isDesktopApp()) {
    return;
  }

  try {
    state.desktopWindowState = await desktopBridge().getWindowState();
  } catch (error) {
    state.desktopWindowState = null;
  }

  const maximized = Boolean(state.desktopWindowState?.isMaximized);
  if (dom.windowMaximizeButton) {
    dom.windowMaximizeButton.classList.toggle("active", maximized);
    dom.windowMaximizeButton.setAttribute(
      "aria-label",
      maximized ? "Restore window" : "Maximize window"
    );
  }

  state.compactMode = Boolean(state.desktopWindowState?.compactMode);
  state.compactExpanded = Boolean(state.desktopWindowState?.compactExpanded);
  state.menuBarOnlyMode = Boolean(
    state.desktopWindowState?.menuBarOnlyMode ?? state.desktopEnvironment?.menuBarOnlyMode
  );
  renderCompactMode();
  void syncCompactPresence();
}

function renderCompactMode() {
  document.body.classList.toggle("compact-mode", Boolean(state.compactMode));
  document.body.classList.toggle("compact-expanded", Boolean(state.compactExpanded));
  if (dom.dynamicIslandToggle) {
    dom.dynamicIslandToggle.textContent = state.compactMode ? "Full" : "Island";
    dom.dynamicIslandToggle.classList.toggle("active", Boolean(state.compactMode));
  }
  queueDesktopOverlaySync();
}

function preferredCompactMode() {
  try {
    return window.localStorage.getItem(COMPACT_MODE_KEY) === "1";
  } catch (error) {
    return false;
  }
}

async function setCompactMode(enabled) {
  const nextValue = Boolean(enabled);
  state.compactMode = nextValue;
  renderCompactMode();

  try {
    window.localStorage.setItem(COMPACT_MODE_KEY, nextValue ? "1" : "0");
  } catch (error) {
    // Ignore storage failures and keep the current mode.
  }

  if (isDesktopApp() && desktopBridge().setCompactMode) {
    try {
      state.desktopWindowState = await desktopBridge().setCompactMode(nextValue);
      state.compactExpanded = Boolean(state.desktopWindowState?.compactExpanded);
      state.menuBarOnlyMode = Boolean(
        state.desktopWindowState?.menuBarOnlyMode ?? state.menuBarOnlyMode
      );
    } catch (error) {
      // Ignore desktop resize failures and keep the UI mode.
    }
  }

  renderCompactMode();
  syncRecognitionEngineForContext();
}

async function ensureDesktopMicrophonePermission() {
  if (!isDesktopApp()) {
    return true;
  }

  if (state.desktopPermissions?.microphone === "granted") {
    return true;
  }

  try {
    const result = await desktopBridge().requestMicrophoneAccess();
    state.desktopPermissions = result?.permissions || state.desktopPermissions;
    renderDesktopSetup();
    return Boolean(result?.granted);
  } catch (error) {
    return false;
  }
}

async function ensureBrowserMicrophoneStream() {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== "function"
  ) {
    return true;
  }

  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false
    });
    return true;
  } catch (error) {
    return false;
  } finally {
    for (const track of stream?.getTracks?.() || []) {
      try {
        track.stop();
      } catch (error) {
        // Ignore cleanup issues for already-closed tracks.
      }
    }
  }
}

async function getLocalSpeechStream() {
  if (state.localSpeechStream) {
    return state.localSpeechStream;
  }

  state.localSpeechStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      sampleRate: 16000,
      sampleSize: 16,
      latency: 0,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    },
    video: false
  });

  return state.localSpeechStream;
}

function resetLocalSpeechBuffers() {
  state.localSpeechBuffers = [];
  state.localSpeechActive = false;
  state.localSpeechLastVoiceAt = 0;
  state.localSpeechStartedAt = 0;
  state.localSpeechConsecutiveLoudFrames = 0;
}

function resetLocalSpeechCalibration() {
  state.localSpeechNoiseFloor = 0;
  state.localSpeechNoiseSamples = 0;
  state.localSpeechCalibrationUntil = Date.now() + LOCAL_SPEECH_CALIBRATION_MS;
}

function rememberLocalSpeechPreRoll(chunk) {
  state.localSpeechPreRoll.push(chunk);
  if (state.localSpeechPreRoll.length > LOCAL_SPEECH_PRE_ROLL_CHUNKS) {
    state.localSpeechPreRoll.splice(
      0,
      state.localSpeechPreRoll.length - LOCAL_SPEECH_PRE_ROLL_CHUNKS
    );
  }
}

function currentLocalSpeechThreshold() {
  const adaptiveFloor =
    state.localSpeechNoiseSamples > 0
      ? state.localSpeechNoiseFloor * LOCAL_SPEECH_NOISE_MULTIPLIER
      : 0;
  return Math.max(LOCAL_SPEECH_THRESHOLD, adaptiveFloor);
}

function updateLocalSpeechNoiseFloor(rms, now) {
  if (state.localSpeechActive || state.localSpeechRequestInFlight || state.speaking) {
    return;
  }

  const threshold = currentLocalSpeechThreshold();
  const cappedSample = Math.min(rms, LOCAL_SPEECH_NOISE_CEILING);
  if (cappedSample > threshold * 1.35 && now >= state.localSpeechCalibrationUntil) {
    return;
  }

  if (!state.localSpeechNoiseSamples) {
    state.localSpeechNoiseFloor = cappedSample;
    state.localSpeechNoiseSamples = 1;
    return;
  }

  state.localSpeechNoiseFloor =
    state.localSpeechNoiseFloor * (1 - LOCAL_SPEECH_NOISE_SMOOTHING) +
    cappedSample * LOCAL_SPEECH_NOISE_SMOOTHING;
  state.localSpeechNoiseSamples += 1;
}

function mergeAudioBuffers(buffers) {
  const totalLength = buffers.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;

  for (const chunk of buffers) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return merged;
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeText = (offset, text) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(offset, sample < 0 ? sample * 32768 : sample * 32767, true);
    offset += 2;
  }

  return buffer;
}

async function handleRecognizedTranscript(finalTranscript) {
  const acceptedRawTranscript = String(finalTranscript || "").trim();
  if (!acceptedRawTranscript) {
    return;
  }

  const acceptedProcessedTranscript = repairRecognizedTranscript(acceptedRawTranscript);

  if (state.speaking) {
    if (isStopCommand(acceptedProcessedTranscript, { requireWake: true })) {
      stopCurrentConversation();
    }
    return;
  }

  if (
    transcriptLooksLikeAssistantEcho(acceptedProcessedTranscript) ||
    shouldIgnoreDuringEchoTail(acceptedProcessedTranscript)
  ) {
    if (!state.awaitingConfirmation && !state.awaitingSelection) {
      setMainLine(defaultHeadline());
    }
    return;
  }

  const acceptedWake = parseWakePhrase(acceptedProcessedTranscript);
  const acceptedTranscript = acceptedWake.command || acceptedProcessedTranscript;
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
  await runCommand(acceptedTranscript, {
    rawTranscript: acceptedRawTranscript,
    wakeMatched: acceptedWake.wakeMatched,
    inputSource: "speech"
  });

  if (!state.handsFree && shouldUseLocalSpeechRecognition()) {
    pauseAssistant();
  }
}

async function sendLocalSpeechForTranscription(samples, sampleRate) {
  if (!samples.length) {
    return;
  }

  state.localSpeechRequestInFlight = true;
  setMainLine("Understanding your voice");
  setSubtitle("Transcribing...");
  setStatus({
    label: "Transcribing",
    pill: "Working",
    note: "Jarvis is converting your voice into a command on this laptop."
  });

  try {
    const language =
      state.conversationLanguage && state.conversationLanguage !== "auto"
        ? state.conversationLanguage
        : state.recognitionLang === "hi-IN"
          ? "hindi"
          : state.recognitionLang === "te-IN"
            ? "telugu"
            : "auto";

    const response = await fetch("/api/transcribe", {
      method: "POST",
      headers: {
        "Content-Type": "audio/wav",
        "X-Jarvis-Language": language
      },
      body: encodeWav(samples, sampleRate)
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.reply || "Jarvis could not understand that audio.");
    }

    if (state.config?.speechRecognition) {
      state.config.speechRecognition.status = "ready";
      state.config.speechRecognition.available = true;
      state.config.speechRecognition.error = "";
    }

    const transcript = String(payload.text || "").trim();
    if (!transcript) {
      clearSubtitle();
      setMainLine(defaultHeadline());
      setStatus({
        label: "Listening",
        pill: "Listening",
        note: describeListeningMode()
      });
      return;
    }

    setMainLine(transcript);
    setSubtitle(transcript);
    await handleRecognizedTranscript(transcript);
  } finally {
    state.localSpeechRequestInFlight = false;
    if (state.voiceSessionEnabled && !state.speaking) {
      state.listening = true;
      updateRecognitionBadge();
      if (!state.awaitingConfirmation && !state.awaitingSelection) {
        setStatus({
          label: "Listening",
          pill: "Listening",
          note: describeListeningMode()
        });
      }
    }
  }
}

async function flushLocalSpeechSegment() {
  if (
    state.localSpeechRequestInFlight ||
    !state.localSpeechBuffers.length ||
    state.micPausedForAssistantSpeech ||
    state.speaking
  ) {
    resetLocalSpeechBuffers();
    return;
  }

  const sampleRate = state.localSpeechContext?.sampleRate || 44100;
  const samples = mergeAudioBuffers(state.localSpeechBuffers);
  resetLocalSpeechBuffers();

  const durationMs = (samples.length / sampleRate) * 1000;
  if (durationMs < LOCAL_SPEECH_MIN_MS) {
    return;
  }

  try {
    await sendLocalSpeechForTranscription(samples, sampleRate);
  } catch (error) {
    setStatus({
      label: "Voice recognition problem",
      pill: "Error",
      note: String(error?.message || error || "Jarvis could not understand that audio.")
    });
    setMainLine("Voice recognition needs attention");
  }
}

async function startLocalSpeechCapture() {
  if (state.localSpeechProcessor && state.localSpeechContext && state.localSpeechStream) {
    state.listening = true;
    state.hasStartedRecognition = true;
    updateRecognitionBadge();
    setStatus({
      label: "Listening",
      pill: "Listening",
      note: describeListeningMode()
    });
    return;
  }

  const stream = await getLocalSpeechStream();
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error("This desktop runtime does not expose Web Audio input.");
  }

  const context = state.localSpeechContext || new AudioContextClass({ latencyHint: "interactive" });
  if (context.state === "suspended") {
    await context.resume();
  }

  const source = context.createMediaStreamSource(stream);
  const compressor = context.createDynamicsCompressor();
  const processor = context.createScriptProcessor(LOCAL_SPEECH_CHUNK_SIZE, 1, 1);
  const gain = context.createGain();
  compressor.threshold.value = -40;
  compressor.knee.value = 26;
  compressor.ratio.value = 14;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.16;
  gain.gain.value = 0;
  resetLocalSpeechCalibration();

  processor.onaudioprocess = (event) => {
    if (!state.voiceSessionEnabled) {
      return;
    }

    const input = event.inputBuffer.getChannelData(0);
    const chunk = new Float32Array(input.length);
    chunk.set(input);

    if (state.micPausedForAssistantSpeech || state.speaking) {
      resetLocalSpeechBuffers();
      state.localSpeechPreRoll = [];
      return;
    }

    if (state.localSpeechRequestInFlight) {
      return;
    }

    rememberLocalSpeechPreRoll(chunk);

    let rms = 0;
    let peak = 0;
    for (let index = 0; index < chunk.length; index += 1) {
      const sample = chunk[index];
      rms += sample * sample;
      const absSample = Math.abs(sample);
      if (absSample > peak) {
        peak = absSample;
      }
    }
    rms = Math.sqrt(rms / Math.max(chunk.length, 1));
    const now = Date.now();
    updateLocalSpeechNoiseFloor(rms, now);

    const loudnessThreshold = currentLocalSpeechThreshold();
    const peakThreshold = Math.max(LOCAL_SPEECH_PEAK_THRESHOLD, loudnessThreshold * 3);
    const isLoud = rms >= loudnessThreshold || peak >= peakThreshold;
    if (isLoud) {
      state.localSpeechConsecutiveLoudFrames += 1;
    } else {
      state.localSpeechConsecutiveLoudFrames = 0;
    }

    if (!state.localSpeechActive && state.localSpeechConsecutiveLoudFrames >= LOCAL_SPEECH_MIN_FRAMES) {
      state.localSpeechActive = true;
      state.localSpeechStartedAt = now;
      state.localSpeechLastVoiceAt = now;
      state.localSpeechBuffers = state.localSpeechPreRoll.slice();
      if (!state.speaking) {
        setSubtitle("Listening...");
      }
    }

    if (!state.localSpeechActive) {
      return;
    }

    state.localSpeechBuffers.push(chunk);
    if (isLoud) {
      state.localSpeechLastVoiceAt = now;
    }

    const segmentLengthMs = now - state.localSpeechStartedAt;
    const silenceDurationMs = now - state.localSpeechLastVoiceAt;
    if (
      segmentLengthMs >= LOCAL_SPEECH_MAX_MS ||
      (segmentLengthMs >= LOCAL_SPEECH_MIN_MS && silenceDurationMs >= LOCAL_SPEECH_SILENCE_MS)
    ) {
      void flushLocalSpeechSegment();
    }
  };

  source.connect(compressor);
  compressor.connect(processor);
  processor.connect(gain);
  gain.connect(context.destination);

  state.localSpeechContext = context;
  state.localSpeechSource = source;
  state.localSpeechCompressor = compressor;
  state.localSpeechProcessor = processor;
  state.localSpeechGain = gain;
  state.listening = true;
  state.hasStartedRecognition = true;
  updateRecognitionBadge();
  setStatus({
    label: "Listening",
    pill: "Listening",
    note: describeListeningMode()
  });
}

function stopLocalSpeechCapture() {
  resetLocalSpeechBuffers();
  resetLocalSpeechCalibration();
  state.localSpeechPreRoll = [];
  state.localSpeechRequestInFlight = false;

  if (state.localSpeechProcessor) {
    try {
      state.localSpeechProcessor.disconnect();
    } catch (error) {
      // Ignore disconnect errors during shutdown.
    }
    state.localSpeechProcessor.onaudioprocess = null;
    state.localSpeechProcessor = null;
  }

  if (state.localSpeechSource) {
    try {
      state.localSpeechSource.disconnect();
    } catch (error) {
      // Ignore disconnect errors during shutdown.
    }
    state.localSpeechSource = null;
  }

  if (state.localSpeechCompressor) {
    try {
      state.localSpeechCompressor.disconnect();
    } catch (error) {
      // Ignore disconnect errors during shutdown.
    }
    state.localSpeechCompressor = null;
  }

  if (state.localSpeechGain) {
    try {
      state.localSpeechGain.disconnect();
    } catch (error) {
      // Ignore disconnect errors during shutdown.
    }
    state.localSpeechGain = null;
  }

  if (state.localSpeechContext) {
    try {
      void state.localSpeechContext.close();
    } catch (error) {
      // Ignore already-closed audio contexts.
    }
    state.localSpeechContext = null;
  }

  for (const track of state.localSpeechStream?.getTracks?.() || []) {
    try {
      track.stop();
    } catch (error) {
      // Ignore already-closed tracks.
    }
  }
  state.localSpeechStream = null;
  state.listening = false;
  updateRecognitionBadge();
}

async function refreshDesktopPermissionsOnly() {
  if (!isDesktopApp()) {
    return;
  }

  try {
    state.desktopPermissions = await desktopBridge().getPermissionStatus();
  } catch (error) {
    // Ignore permission refresh failures and keep the last known state.
  }
  renderDesktopSetup();
}

async function openDesktopPermissionSettings(section) {
  if (!isDesktopApp()) {
    return;
  }

  try {
    const result = await desktopBridge().openPermissionSettings(section);
    state.desktopPermissions = result?.permissions || state.desktopPermissions;
  } catch (error) {
    // Ignore settings-launch failures and leave the current state visible.
  }
  renderDesktopSetup();
}

async function promptDesktopAccessibility() {
  if (!isDesktopApp()) {
    return;
  }

  try {
    state.desktopPermissions = await desktopBridge().promptAccessibilityAccess();
  } catch (error) {
    // Ignore prompt failures and keep the current state visible.
  }
  renderDesktopSetup();
}

async function beginVoiceCapture() {
  unlockSpeech();
  extendCommandWindow();
  ensureRecognition();
  state.voiceSessionEnabled = true;
  rememberVoiceSessionPreference(true);
  updateRecognitionBadge();

  if (!(await ensureDesktopMicrophonePermission())) {
    state.voiceSessionEnabled = false;
    rememberVoiceSessionPreference(false);
    updateRecognitionBadge();
    setStatus({
      label: "Microphone permission needed",
      pill: "Setup",
      note: "Use Desktop Setup to allow microphone access for Jarvis on this laptop."
    });
    setMainLine("Allow microphone to use voice");
    return;
  }

  if (!(await ensureBrowserMicrophoneStream())) {
    state.voiceSessionEnabled = false;
    rememberVoiceSessionPreference(false);
    updateRecognitionBadge();
    setStatus({
      label: "Microphone blocked",
      pill: "Setup",
      note: "macOS or Electron blocked microphone capture. Open Desktop Setup and allow microphone access for Jarvis."
    });
    setMainLine("Microphone access is blocked");
    return;
  }

  rememberMicPermission();
  startListening();
}

async function syncCompactPresence() {
  if (!isDesktopApp()) {
    return;
  }

  const subtitleActive = Boolean(dom.subtitleText?.textContent?.trim());
  const shouldExpand = Boolean(
    state.compactMode &&
      (state.speaking || subtitleActive || state.awaitingConfirmation || state.awaitingSelection)
  );

  if (state.compactExpanded !== shouldExpand) {
    state.compactExpanded = shouldExpand;
    renderCompactMode();

    if (desktopBridge().setCompactExpanded) {
      try {
        state.desktopWindowState = await desktopBridge().setCompactExpanded(shouldExpand);
        state.compactExpanded = Boolean(state.desktopWindowState?.compactExpanded);
        renderCompactMode();
      } catch (error) {
        // Ignore compact expansion errors and keep the current UI state.
      }
    }
  }

  if (
    shouldExpand &&
    backgroundWakeModeActive() &&
    desktopBridge().showCompactPresence
  ) {
    try {
      await desktopBridge().showCompactPresence();
    } catch (error) {
      // Ignore wake presence failures and keep listening in the background.
    }
  }
}

function currentOverlayStatePayload() {
  const title = String(dom.centerLabel?.textContent || "").trim();
  const subtitle = String(dom.subtitleText?.textContent || dom.assistantLine?.textContent || "").trim();
  const note = String(dom.centerNote?.textContent || "").trim();
  const awake = Boolean(
    state.awaitingConfirmation ||
      state.awaitingSelection ||
      commandWindowOpen() ||
      state.voiceSessionEnabled ||
      state.listening ||
      state.speaking
  );

  return {
    assistantName: state.config?.assistantName || "Jarvis",
    title: title || "Jarvis",
    subtitle: subtitle || String(dom.assistantLine?.textContent || "Say Hey Jarvis").trim(),
    note: note || describeListeningMode(),
    quickHint: quickSummonShortcutLabel(),
    listening: Boolean(state.listening),
    speaking: Boolean(state.speaking),
    awake,
    expanded: Boolean(state.compactExpanded || state.speaking || state.awaitingConfirmation || state.awaitingSelection),
    visible: Boolean(awake || state.compactMode || backgroundWakeModeActive())
  };
}

function queueDesktopOverlaySync() {
  if (!desktopOverlayBridgeAvailable()) {
    return;
  }

  if (state.overlaySyncTimeout) {
    window.clearTimeout(state.overlaySyncTimeout);
  }

  state.overlaySyncTimeout = window.setTimeout(async () => {
    state.overlaySyncTimeout = null;
    try {
      await desktopBridge().updateOverlayState(currentOverlayStatePayload());
    } catch (error) {
      // Ignore overlay sync failures and keep the main assistant running.
    }
  }, 35);
}

function isWakeWordRequiredForContext() {
  if (state.awaitingConfirmation || state.awaitingSelection || commandWindowOpen()) {
    return false;
  }

  return Boolean(backgroundWakeModeActive() || state.menuBarOnlyMode || state.compactMode);
}

function syncRecognitionEngineForContext(options = {}) {
  const desiredKind = preferredRecognitionEngineKind();
  const shouldResume = state.voiceSessionEnabled && state.handsFree && !state.speaking;

  if (state.recognition && state.recognition.kind !== desiredKind) {
    disposeRecognition(state.recognition);
    state.recognition = null;
    state.listening = false;
    state.recognitionRestartPending = false;
    updateRecognitionBadge();
  }

  ensureRecognition();

  if (shouldResume && !state.listening) {
    window.setTimeout(() => {
      if (state.voiceSessionEnabled && state.handsFree && !state.speaking && !state.listening) {
        startListening();
      }
    }, Number(options.delayMs || 90));
  }
}

function setStatus({ label, pill, note }) {
  dom.centerLabel.textContent = label;
  dom.statusPill.textContent = pill;
  dom.centerNote.textContent = note;
  if (dom.heroStatusBadge) {
    dom.heroStatusBadge.textContent = pill;
  }
  renderActivityState();
  void syncCompactPresence();
  queueDesktopOverlaySync();
}

function updateRecognitionBadge() {
  const languageCode =
    state.recognitionLang === "hi-IN"
      ? "HI"
      : state.recognitionLang === "te-IN"
        ? "TE"
        : "EN";
  const badgeText = state.listening
    ? `Mic live · ${languageCode}`
    : state.voiceSessionEnabled
      ? `Mic standby · ${languageCode}`
      : `Mic off · ${languageCode}`;
  dom.recognitionBadge.textContent = badgeText;
  if (dom.heroRecognitionBadge) {
    dom.heroRecognitionBadge.textContent = badgeText;
  }
  renderActivityState();
}

function renderActivityState() {
  document.body.classList.toggle("activity-speaking", Boolean(state.speaking));
  document.body.classList.toggle(
    "activity-listening",
    Boolean(state.listening) && !state.speaking
  );
  document.body.classList.toggle(
    "activity-awake",
    Boolean(state.awaitingConfirmation || state.awaitingSelection || commandWindowOpen() || state.voiceSessionEnabled)
  );
  queueDesktopOverlaySync();
}

function updateVoiceBadge() {
  let label = "";
  if (activeTtsProvider() === "kokoro_server") {
    label = state.voiceMode === "female" ? "Kokoro Female" : "Kokoro Male";
  } else if (activeTtsProvider() === "gemini_tts") {
    label = state.voiceMode === "female" ? "Premium Female" : "Premium Male";
  } else {
    label = state.voiceMode === "female" ? "Browser Female" : "Browser Male";
  }

  dom.voiceBadge.textContent = label;
  if (dom.desktopVoiceToggle) {
    dom.desktopVoiceToggle.title = `Current voice: ${label}`;
  }
}

function setMainLine(text) {
  dom.assistantLine.textContent = text;
  queueDesktopOverlaySync();
}

function setDrawer(mode) {
  state.drawerMode = mode;
  const active = mode !== "none";
  dom.orbDrawer.classList.toggle("active", active);
  syncDrawerToggles();
  if (!active) {
    return;
  }
  renderDrawer();
  if (dom.drawerContent) {
    dom.drawerContent.scrollTop = 0;
  }
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

function renderSetupDrawer() {
  dom.drawerLabel.textContent = "Desktop";
  dom.drawerTitle.textContent = "This Laptop";
  dom.drawerContent.innerHTML = "";

  const platform = state.desktopEnvironment?.platform || "desktop";
  const { permissions, microphoneReady, accessibilityReady, automationReady, allReady } =
    desktopPermissionState();

  dom.drawerContent.append(
    createDrawerBlock(
      allReady ? "Jarvis is ready here." : "Finish setup on this laptop.",
      platform === "darwin"
        ? "macOS protects microphone, accessibility, and automation access. Jarvis can guide the user, but the final approval still happens in System Settings."
        : "Allow the requested permissions once and Jarvis will use this laptop's own voice controls and native actions."
    )
  );

  dom.drawerContent.append(
    createDrawerMetric(
      "Microphone",
      permissionSummary("Microphone", permissions.microphone),
      microphoneReady
        ? "Jarvis can listen and respond with voice on this laptop."
        : "Approve microphone access once so voice capture can start.",
      [
        createDrawerAction("Allow microphone", ensureDesktopMicrophonePermission, {
          primary: !microphoneReady,
          disabled: microphoneReady
        })
      ]
    )
  );

  dom.drawerContent.append(
    createDrawerMetric(
      "Accessibility",
      permissionSummary("Accessibility", permissions.accessibility),
      accessibilityReady
        ? "Jarvis can control supported desktop features here."
        : "macOS may open Accessibility settings so the user can enable Jarvis manually.",
      [
        createDrawerAction("Open Accessibility", promptDesktopAccessibility, {
          disabled: accessibilityReady
        })
      ]
    )
  );

  dom.drawerContent.append(
    createDrawerMetric(
      "Automation",
      permissionSummary("Automation", permissions.automation),
      automationReady
        ? "Automation is enabled for app-to-app actions."
        : "If the user is asked, they should allow Jarvis in the Automation section for supported app control.",
      [
        createDrawerAction(
          "Open Automation",
          async () => openDesktopPermissionSettings("automation"),
          {
            disabled: automationReady
          }
        ),
        createDrawerAction("Refresh", refreshDesktopPermissionsOnly)
      ]
    )
  );

  dom.drawerContent.append(
    createDrawerSwitch(
      "Launch Jarvis when this laptop signs in",
      state.desktopEnvironment?.launchAtLogin,
      setDesktopLaunchAtLogin,
      "This keeps Jarvis ready in the tray or menu bar after restart."
    )
  );

  const shortcut = quickSummonShortcutLabel();
  if (shortcut) {
    dom.drawerContent.append(
      createDrawerMetric(
        "Quick summon",
        shortcut,
        "Use the global shortcut from any app to surface Jarvis instantly and start speaking without hunting for the window."
      )
    );
  }

  if (platform === "darwin") {
    dom.drawerContent.append(
      createDrawerSwitch(
        "Menu bar only mode",
        state.menuBarOnlyMode,
        setMenuBarOnlyMode,
        'Jarvis hides the Dock icon, keeps running in the menu bar, and can still wake when you say "Hey Jarvis".'
      )
    );
  }
}

function renderVoiceDrawer() {
  dom.drawerLabel.textContent = "Audio";
  dom.drawerTitle.textContent = "Voice Control";
  dom.drawerContent.innerHTML = "";

  const modeBlock = document.createElement("div");
  modeBlock.className = "drawer-metric";

  const title = document.createElement("strong");
  title.className = "drawer-metric-title";
  title.textContent = "Jarvis voice";

  const status = document.createElement("span");
  status.className = "drawer-metric-status";
  status.textContent = dom.voiceBadge?.textContent || "Voice ready";

  const note = document.createElement("p");
  note.className = "drawer-metric-note";
  note.textContent =
    "Pick the voice personality Jarvis should use for replies on this laptop.";

  const modeSwitch = document.createElement("div");
  modeSwitch.className = "drawer-mode-switch";

  for (const mode of ["female", "male"]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = mode === "female" ? "Female" : "Male";
    if (state.voiceMode === mode) {
      button.classList.add("active");
    }
    button.addEventListener("click", () => {
      unlockSpeech();
      setVoiceMode(mode);
      renderDrawer();
    });
    modeSwitch.append(button);
  }

  modeBlock.append(title, status, note, modeSwitch);
  dom.drawerContent.append(modeBlock);

  dom.drawerContent.append(
    createDrawerMetric(
      "Speech provider",
      dom.voiceProviderName?.textContent || "Browser speech",
      dom.voiceNote?.textContent || "Jarvis is using the current speech engine."
    )
  );

  dom.drawerContent.append(
    createDrawerMetric(
      "Voice recognition",
      dom.recognitionBadge?.textContent || "Mic off",
      state.voiceSessionEnabled
        ? state.handsFree
          ? "Hands-free mode is on, so Jarvis will keep listening after each reply."
          : "Voice is active for this session. Jarvis will stop listening after the current turn unless you start it again."
        : "The mic stays off until you press Start Voice.",
      [
        createDrawerAction(state.handsFree ? "Turn off hands-free" : "Turn on hands-free", () => {
          state.handsFree = !state.handsFree;
          if (dom.handsFreeToggle) {
            dom.handsFreeToggle.checked = state.handsFree;
          }
          if (state.handsFree && state.voiceSessionEnabled) {
            extendCommandWindow();
            startListening();
          } else {
            clearCommandWindow();
          }
          renderDrawer();
        })
      ]
    )
  );

  dom.drawerContent.append(
    createDrawerMetric(
      "Locked voices",
      `${dom.femaleVoiceName?.textContent || "Female voice loading"} / ${
        dom.maleVoiceName?.textContent || "Male voice loading"
      }`,
      "Jarvis keeps one preferred female voice and one preferred male voice ready for quick switching."
    )
  );
}

function renderCommandsDrawer() {
  dom.drawerLabel.textContent = "Actions";
  dom.drawerTitle.textContent = "Command Library";
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
  dom.drawerLabel.textContent = "Memory";
  dom.drawerTitle.textContent = "Conversation";
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
  if (state.drawerMode === "setup") {
    renderSetupDrawer();
    return;
  }

  if (state.drawerMode === "voice") {
    renderVoiceDrawer();
    return;
  }

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
  return state.awaitingSelection
    ? "Awaiting your contact choice"
    : state.awaitingConfirmation
      ? "Awaiting your confirmation"
      : `Awaiting your voice${activeConversationLanguage() !== "auto" ? ` in ${conversationLanguageLabel(activeConversationLanguage())}` : ""}`;
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
  void syncCompactPresence();
  queueDesktopOverlaySync();
}

function clearSubtitle() {
  setSubtitle("");
}

function rememberPendingSpeech(text) {
  state.pendingSpeechText = String(text || "").trim();
}

function appendPendingSpeech(text) {
  const nextText = String(text || "").trim();
  if (!nextText) {
    return;
  }

  state.pendingSpeechText = [state.pendingSpeechText, nextText]
    .filter(Boolean)
    .join(" ")
    .trim();
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

function pauseListeningForAssistantSpeech() {
  clearListeningResume();
  if (shouldUseLocalSpeechRecognition()) {
    state.micPausedForAssistantSpeech = true;
    return;
  }

  if (state.allowBargeIn && state.listening && state.recognition) {
    state.micPausedForAssistantSpeech = false;
    state.bargeInActive = true;
    return;
  }

  state.micPausedForAssistantSpeech = true;
  if (state.listening && state.recognition) {
    try {
      state.recognition.stop();
    } catch (error) {
      // Ignore browser errors if recognition is already stopping.
    }
  }
}

function releaseListeningAfterAssistantSpeech() {
  state.micPausedForAssistantSpeech = false;
  state.bargeInActive = false;
  if (shouldUseLocalSpeechRecognition() && state.voiceSessionEnabled && !state.localSpeechRequestInFlight) {
    state.listening = true;
    updateRecognitionBadge();
  }
}

function scheduleListeningResume(delayMs = 520) {
  clearListeningResume();

  if (shouldUseLocalSpeechRecognition()) {
    if (state.voiceSessionEnabled && state.handsFree && !state.speaking) {
      state.listening = true;
      updateRecognitionBadge();
    }
    return;
  }

  if (!state.voiceSessionEnabled || !state.handsFree || !state.recognition) {
    return;
  }

  state.listeningResumeTimeout = window.setTimeout(() => {
    state.listeningResumeTimeout = null;
    if (
      state.voiceSessionEnabled &&
      state.handsFree &&
      state.recognition &&
      !state.speaking &&
      !state.listening
    ) {
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
  const synth = speechSynthesisApi();
  try {
    if (synth) {
      synth.resume();
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

function buildServerSpeechChunks(text, language) {
  const source = String(text || "").trim();
  if (!source) {
    return [];
  }

  const provider = serverProviderForLanguage(language);
  const firstChunkMaxWords = provider === "kokoro_server" ? 2 : 3;
  const laterChunkMaxWords = provider === "gemini_tts" ? 12 : 8;
  const sentences = source
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks = [];
  let isFirstChunk = true;
  for (const sentence of sentences.length ? sentences : [source]) {
    const words = sentence.split(/\s+/).filter(Boolean);
    const maxWordsPerChunk = isFirstChunk ? firstChunkMaxWords : laterChunkMaxWords;
    if (words.length <= maxWordsPerChunk) {
      chunks.push(sentence);
      isFirstChunk = false;
      continue;
    }
    let index = 0;
    while (index < words.length) {
      const chunkSize = isFirstChunk ? firstChunkMaxWords : laterChunkMaxWords;
      chunks.push(words.slice(index, index + chunkSize).join(" "));
      index += chunkSize;
      isFirstChunk = false;
    }
  }

  return chunks.filter(Boolean);
}

function latestSpeakableOffset(text, startIndex = 0) {
  const source = String(text || "");
  let lastBoundary = -1;
  for (let index = Math.max(0, startIndex); index < source.length; index += 1) {
    const char = source[index];
    if (!/[.!?]/.test(char)) {
      continue;
    }
    if (index === source.length - 1 || /\s/.test(source[index + 1])) {
      lastBoundary = index + 1;
    }
  }
  return lastBoundary;
}

function queueStreamingSpeech(fullText, consumedLength, language, options = {}) {
  const source = String(fullText || "");
  const startIndex = Math.max(0, Number(consumedLength || 0));
  const targetIndex = options.force
    ? source.length
    : latestSpeakableOffset(source, startIndex);

  if (!targetIndex || targetIndex <= startIndex) {
    return startIndex;
  }

  const nextChunk = source.slice(startIndex, targetIndex).trim();
  if (!nextChunk) {
    return targetIndex;
  }

  if (state.speaking) {
    appendPendingSpeech(nextChunk);
  } else {
    rememberPendingSpeech(nextChunk);
    void flushPendingSpeech();
  }

  return targetIndex;
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

function englishVoicePool() {
  return state.voices.filter(
    (voice) => /^en(-|$)/i.test(voice.lang) || /india/i.test(voice.name)
  );
}

function voicePoolForLanguage(language) {
  const resolvedLanguage = normalizeConversationLanguage(language) || "english";
  if (resolvedLanguage === "hindi") {
    return state.voices.filter((voice) => /^hi(-|$)/i.test(voice.lang));
  }
  if (resolvedLanguage === "telugu") {
    return state.voices.filter((voice) => /^te(-|$)/i.test(voice.lang));
  }

  const englishVoices = englishVoicePool();
  return englishVoices.length ? englishVoices : state.voices;
}

function collectVoices() {
  const synth = speechSynthesisApi();
  if (!synth || typeof synth.getVoices !== "function") {
    state.voices = [];
    updateVoiceLockSummary();
    return;
  }

  state.voices = synth.getVoices().sort((left, right) => left.name.localeCompare(right.name));
  lockPreferredVoices();
}

function exactVoiceByName(candidates, voices = state.voices) {
  for (const candidate of candidates) {
    const match = voices.find((voice) => voice.name === candidate);
    if (match) {
      return match;
    }
  }
  return null;
}

function googleVoices(voices = state.voices) {
  return voices.filter((voice) => /google/i.test(voice.name));
}

function preferredVoiceFor(mode) {
  const voicePool = voicePoolForLanguage("english");
  const exactMatch =
    mode === "female"
      ? exactVoiceByName(FEMALE_VOICE_PRIORITY, voicePool)
      : exactVoiceByName(MALE_VOICE_PRIORITY, voicePool);

  if (exactMatch) {
    return exactMatch;
  }

  const groupedGoogle = googleVoices(voicePool).filter(
    (voice) => inferVoiceGroup(voice) === mode
  );
  if (groupedGoogle.length) {
    return groupedGoogle[0];
  }

  if (mode === "male") {
    const googleUsEnglish = googleVoices(voicePool).find(
      (voice) => voice.name === "Google US English"
    );
    if (googleUsEnglish) {
      return googleUsEnglish;
    }
  }

  return null;
}

function bestFallbackVoiceFor(mode) {
  const voicePool = voicePoolForLanguage("english");
  const exactGroup = voicePool.filter((voice) => inferVoiceGroup(voice) === mode);
  if (exactGroup.length) {
    return exactGroup[0];
  }
  return voicePool[0] || state.voices[0] || null;
}

function preferredVoiceForLanguage(language, mode) {
  const voicePool = voicePoolForLanguage(language);
  if (!voicePool.length) {
    return null;
  }

  const exactGroup = voicePool.filter((voice) => inferVoiceGroup(voice) === mode);
  if (exactGroup.length) {
    return exactGroup[0];
  }

  const googleGroup = googleVoices(voicePool).filter(
    (voice) => inferVoiceGroup(voice) === mode
  );
  if (googleGroup.length) {
    return googleGroup[0];
  }

  return voicePool[0];
}

function voiceLabel(voice, fallbackLabel) {
  if (!voice) {
    return fallbackLabel;
  }
  return voice.name;
}

function configuredServerProvider() {
  return ["kokoro_server", "gemini_tts"].includes(state.config?.tts?.provider)
    ? state.config.tts.provider
    : "";
}

function activeTtsProvider() {
  if (configuredServerProvider() && !state.serverTtsDisabled) {
    return state.config.tts.provider;
  }

  return "browser";
}

function serverTtsFallbackNote() {
  const configuredProvider = configuredServerProvider();
  const status = state.config?.tts?.status;
  const errorMessage = state.serverTtsError || state.config?.tts?.error || "";
  const premiumStatus = state.config?.tts?.premiumStatus;
  const premiumError = state.config?.tts?.premiumError || "";
  const languageProviders = state.config?.tts?.languageProviders || {};
  const hindiProvider = languageProviders.hindi;
  const teluguProvider = languageProviders.telugu;
  const hindiVoice = state.config?.tts?.nativeVoices?.hindi;
  const teluguVoice = state.config?.tts?.nativeVoices?.telugu;
  const premiumHindiVoice = state.config?.tts?.premiumVoices?.hindi;
  const premiumTeluguVoice = state.config?.tts?.premiumVoices?.telugu;
  const kokoroEverywhere =
    configuredProvider === "kokoro_server" &&
    hindiProvider === "kokoro_server" &&
    teluguProvider === "kokoro_server";
  const premiumIndic =
    (hindiProvider === "gemini_tts" && premiumHindiVoice) ||
    (teluguProvider === "gemini_tts" && premiumTeluguVoice);

  if (configuredProvider === "kokoro_server") {
    if (status === "loading" || status === "idle") {
      if (kokoroEverywhere) {
        return "Kokoro is warming up for English, Hindi, and Telugu.";
      }
      if (premiumIndic && (premiumStatus === "loading" || premiumStatus === "idle")) {
        return "Kokoro is warming up for English while Gemini premium voices warm up for Hindi and Telugu.";
      }
      return "Kokoro is still warming up on this laptop.";
    }

    if (errorMessage) {
      if (kokoroEverywhere) {
        return `Kokoro is unavailable right now. ${errorMessage}`;
      }
      return premiumIndic
        ? `Kokoro is unavailable for English right now, but Gemini premium still handles Hindi and Telugu. ${errorMessage}`
        : `Kokoro is unavailable right now. ${errorMessage}`;
    }
  }

  if (premiumIndic && premiumError) {
    return `Premium Gemini voices are unavailable for Hindi/Telugu right now, so Jarvis is using Kokoro instead. ${premiumError}`;
  }

  if (configuredProvider === "gemini_tts" && errorMessage) {
    return `Premium Gemini speech is unavailable right now. ${errorMessage}`;
  }

  return "Jarvis is using the clearest available female and male voices exposed by this browser.";
}

function usesServerAudio() {
  return ["kokoro_server", "gemini_tts"].includes(activeTtsProvider());
}

function updateVoiceLockSummary() {
  const languageProviders = state.config?.tts?.languageProviders || {};
  const hindiProvider = languageProviders.hindi;
  const teluguProvider = languageProviders.telugu;
  const premiumHindiVoice = state.config?.tts?.premiumVoices?.hindi;
  const premiumTeluguVoice = state.config?.tts?.premiumVoices?.telugu;

  if (activeTtsProvider() === "kokoro_server") {
    dom.voiceProviderName.textContent = "Kokoro Neural TTS";
    dom.femaleVoiceName.textContent =
      state.config.tts.femaleVoice || "Kokoro female voice";
    dom.maleVoiceName.textContent =
      state.config.tts.maleVoice || "Kokoro male voice";
    const kokoroStatus = state.config?.tts?.status;
    if (kokoroStatus === "loading" || kokoroStatus === "idle" || state.serverTtsError) {
      dom.voiceNote.textContent = serverTtsFallbackNote();
      return;
    }
    dom.voiceNote.textContent =
      hindiProvider === "kokoro_server" && teluguProvider === "kokoro_server"
        ? "Jarvis uses Kokoro for English, Hindi, and Telugu."
        : hindiProvider === "gemini_tts" && teluguProvider === "gemini_tts"
          ? `Jarvis uses Kokoro for English, ${premiumHindiVoice || "Gemini premium"} for Hindi, and ${premiumTeluguVoice || "Gemini premium"} for Telugu.`
          : hindiProvider === "gemini_tts"
            ? `Jarvis uses Kokoro for English, ${premiumHindiVoice || "Gemini premium"} for Hindi, and Kokoro for Telugu.`
            : teluguProvider === "gemini_tts"
              ? `Jarvis uses Kokoro for English, Kokoro for Hindi, and ${premiumTeluguVoice || "Gemini premium"} for Telugu.`
        : hindiProvider === "kokoro_server" && teluguProvider === "kokoro_server"
          ? "Jarvis uses Kokoro for English, Hindi, and Telugu."
          : "Jarvis uses Kokoro for English replies. Other languages fall back to premium or Kokoro server speech.";
    return;
  }

  if (activeTtsProvider() === "gemini_tts") {
    dom.voiceProviderName.textContent = "Gemini Premium TTS";
    dom.femaleVoiceName.textContent =
      state.config.tts.femaleVoice || "Premium female voice";
    dom.maleVoiceName.textContent =
      state.config.tts.maleVoice || "Premium male voice";
    dom.voiceNote.textContent =
      "Jarvis is speaking through premium Gemini voices instead of local macOS voices.";
    return;
  }

  dom.voiceProviderName.textContent = "Browser Speech";
  dom.femaleVoiceName.textContent = voiceLabel(state.femaleVoice, "No female voice found");
  dom.maleVoiceName.textContent = voiceLabel(state.maleVoice, "No male voice found");
  dom.voiceNote.textContent = serverTtsFallbackNote();
}

function disableServerTts(error) {
  const message = String(error?.message || error || "").trim();
  const normalized = message.toLowerCase();
  state.serverTtsError = message;
  state.serverTtsDisabled = normalized.includes("disabled on this host");
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
  const activeLanguage = activeConversationLanguage();
  const conversationCode = conversationLanguageCode(activeLanguage);
  if (conversationCode && conversationCode !== "auto") {
    return conversationCode;
  }
  return browserPreferredRecognitionLang();
}

function requestRecognitionRestart() {
  if (shouldUseLocalSpeechRecognition()) {
    updateRecognitionBadge();
    return;
  }

  if (!state.recognition || state.speaking) {
    return;
  }

  if (state.listening) {
    state.recognitionRestartPending = true;
    clearListeningResume();
    try {
      state.recognition.stop();
    } catch (error) {
      state.recognitionRestartPending = false;
    }
    return;
  }

  if (state.voiceSessionEnabled && (state.hasStartedRecognition || state.handsFree)) {
    window.setTimeout(() => {
      if (!state.speaking && !state.listening) {
        startListening();
      }
    }, 80);
  }
}

function applyRecognitionLanguage(options = {}) {
  const nextLanguage = preferredRecognitionLang();
  const changed = state.recognitionLang !== nextLanguage;
  state.recognitionLang = nextLanguage;
  if (state.recognition) {
    state.recognition.lang = nextLanguage;
  }
  updateRecognitionBadge();

  if (changed && options.restartIfNeeded) {
    requestRecognitionRestart();
  }
}

function setConversationLanguage(language, options = {}) {
  state.conversationLanguage = normalizeConversationLanguage(language) || "auto";
  const desiredKind = preferredRecognitionEngineKind();
  if (state.recognition && state.recognition.kind !== desiredKind) {
    disposeRecognition(state.recognition);
    state.recognition = null;
    state.listening = false;
  }
  applyRecognitionLanguage({
    restartIfNeeded: options.restartRecognition !== false
  });
  syncRecognitionEngineForContext();
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
    "english",
    "अंग्रेजी",
    "इंग्लिश",
    "ఇంగ్లీష్",
    "hindi",
    "telugu",
    "हिंदी",
    "తెలుగు",
    "जार्विस",
    "జార్విస్",
    "history",
    "show scheduled messages",
    "schedule a whatsapp to dad saying i will be late tomorrow at 6 pm",
    "commands",
    "dark mode",
    "light mode",
    "wifi",
    "bluetooth",
    "screenshot",
    "volume",
    "change your voice to male",
    "change your voice to female",
    "male voice",
    "female voice"
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);
}

function scoreTranscriptAlternative(transcript) {
  const normalized = normalizeText(repairRecognizedTranscript(transcript));
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

function isStopCommand(transcript, options = {}) {
  const parsedWake = parseWakePhrase(transcript);
  const normalized = normalizeText(parsedWake.command || transcript);
  const matches = STOP_COMMAND_PATTERNS.some((pattern) => pattern.test(normalized));
  if (options.requireWake) {
    return matches && parsedWake.wakeMatched;
  }
  return matches;
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
  releaseListeningAfterAssistantSpeech();
  clearAssistantSpeechReference();
  if (completeSubtitles) {
    finishSubtitlePlayback();
  } else {
    stopSubtitleTimers();
    state.subtitleFrames = [];
    state.subtitleFrameIndex = -1;
  }
  globe.setState({
    speaking: false,
    listening: state.listening,
    awaiting: state.awaitingConfirmation || state.awaitingSelection
  });
  if (state.voiceSessionEnabled && state.handsFree) {
    scheduleListeningResume(520);
  } else {
    setStatus({
      label: state.awaitingSelection
        ? "Awaiting contact choice"
        : state.awaitingConfirmation
          ? "Awaiting confirmation"
          : "Awaiting command",
      pill: state.awaitingSelection ? "Choose" : state.awaitingConfirmation ? "Confirm" : "Idle",
      note: state.awaitingSelection
        ? "Say the number or the contact name you want."
        : state.awaitingConfirmation
          ? "Say yes to continue or no to cancel."
        : describeListeningMode()
    });
  }
  setMainLine(defaultHeadline());
  settleSpeechPromise();
  if (state.pendingSpeechText) {
    window.setTimeout(() => {
      void flushPendingSpeech();
    }, 0);
  }
}

function recoverFromSpeechFailure() {
  state.speaking = false;
  releaseListeningAfterAssistantSpeech();
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

  if (state.voiceSessionEnabled && state.handsFree) {
    scheduleListeningResume(520);
  }

  setMainLine(defaultHeadline());
  state.speechResolve = null;
}

function stopAssistantOutput() {
  const synth = speechSynthesisApi();
  const wasSpeaking =
    state.speaking || Boolean(state.audio) || Boolean(synth?.speaking);
  if (!wasSpeaking) {
    return false;
  }

  state.speechJobId += 1;
  abortPendingSpeechRequest();
  stopAudioPlayback();
  synth?.cancel();
  finishSpeaking({ completeSubtitles: false });
  return true;
}

function notifyServerInterrupt() {
  fetch(apiUrl("/api/interrupt"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    }
  }).catch(() => {});
}

function stopCurrentConversation() {
  const synth = speechSynthesisApi();
  const hadActiveWork =
    state.speaking ||
    Boolean(state.audio) ||
    Boolean(synth?.speaking) ||
    Boolean(state.commandAbortController) ||
    state.awaitingConfirmation ||
    state.awaitingSelection;

  state.awaitingConfirmation = false;
  state.awaitingSelection = false;
  releaseListeningAfterAssistantSpeech();
  state.speechJobId += 1;
  abortPendingSpeechRequest();
  abortPendingCommandRequest();
  stopAudioPlayback();
  synth?.cancel();
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
    label: state.voiceSessionEnabled && state.handsFree ? "Listening" : "Awaiting command",
    pill: state.voiceSessionEnabled && state.handsFree ? "Listening" : "Idle",
    note: state.voiceSessionEnabled && state.handsFree
      ? describeListeningMode()
      : 'Press Start Voice once to enable the mic. After that you can say "Hey Jarvis".'
  });

  if (state.voiceSessionEnabled && state.handsFree && !state.listening) {
    startListening();
  }

  settleSpeechPromise();
  notifyServerInterrupt();
  return hadActiveWork;
}

function pauseAssistant() {
  state.voiceSessionEnabled = false;
  rememberVoiceSessionPreference(false);
  updateRecognitionBadge();
  state.awaitingConfirmation = false;
  state.awaitingSelection = false;
  releaseListeningAfterAssistantSpeech();
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

async function speakWithServerAudio(text, language) {
  const chunks = buildServerSpeechChunks(text, language);

  if (!chunks.length) {
    return;
  }

  const currentJobId = state.speechJobId + 1;
  state.speechJobId = currentJobId;

  const fetchSpeechChunk = async (chunkText) => {
    const controller = new AbortController();
    state.speechAbortController = controller;
    const timeoutId = window.setTimeout(() => {
      controller.abort(new DOMException("Timed out waiting for Jarvis audio.", "AbortError"));
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
          voiceMode: state.voiceMode,
          language
        })
      });

      if (!response.ok) {
        let message = "Server speech is unavailable right now.";
        try {
          const payload = await response.json();
          message = payload.reply || message;
        } catch (error) {
          // Ignore JSON parse errors and use fallback message.
        }
        throw new Error(message);
      }

      state.serverTtsDisabled = false;
      state.serverTtsError = "";
      if (state.config?.tts) {
        state.config.tts.status = "ready";
        state.config.tts.available = true;
        state.config.tts.error = "";
      }
      updateVoiceBadge();
      updateVoiceLockSummary();
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
        reject(new Error("Jarvis playback took too long."));
      }, AUDIO_PLAYBACK_TIMEOUT_MS);

      const clearPlaybackTimeout = () => {
        window.clearTimeout(playbackTimeoutId);
      };

      audio.onplay = () => {
        clearPlaybackTimeout();
        pauseListeningForAssistantSpeech();
        state.speaking = true;
        rememberAssistantSpeech(chunkText);
        setSubtitle(chunkText);
        globe.setState({
          speaking: true,
          listening: state.listening,
          awaiting: state.awaitingConfirmation || state.awaitingSelection
        });
        setStatus({
          label: "Assistant speaking",
          pill: "Speaking",
          note: state.awaitingSelection
            ? "A contact choice is waiting."
            : state.awaitingConfirmation
              ? "A confirmation is waiting for yes or no."
            : isFirstChunk
              ? "Jarvis is responding."
              : "Jarvis is continuing the reply."
        });
        setMainLine(
          state.awaitingSelection
            ? "Choice ready"
            : state.awaitingConfirmation
              ? "Confirmation ready"
              : "Speaking now"
        );
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
      let nextAudioPromise = fetchSpeechChunk(chunks[0]);
      for (let index = 0; index < chunks.length; index += 1) {
        const chunkText = chunks[index];
        const audioBlob = await nextAudioPromise;
        if (state.speechJobId !== currentJobId) {
          return;
        }

        nextAudioPromise =
          index + 1 < chunks.length ? fetchSpeechChunk(chunks[index + 1]) : null;

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
  const synth = speechSynthesisApi();
  resumeSpeechOutput();
  state.speechJobId += 1;
  abortPendingSpeechRequest();
  stopAudioPlayback();
  synth?.cancel();
  const speechLanguage = speechLanguageForText(text, options.language);

  if (hasServerAudioForLanguage(speechLanguage) && !shouldUseBrowserSpeech(text, options.language)) {
    if (!state.speechUnlocked && !options.fromPending) {
      queueSpeechUntilUnlock(text);
      return;
    }

    try {
      await speakWithServerAudio(text, speechLanguage);
      return;
    } catch (error) {
      if (isAudioUnlockError(error)) {
        state.speechUnlocked = false;
        queueSpeechUntilUnlock(text);
        return;
      }

      disableServerTts(error);
      if (isDesktopApp()) {
        setStatus({
          label: "Voice reply unavailable",
          pill: "Retry",
          note: "Jarvis stayed off local macOS voices. Try again in a moment."
        });
        setMainLine("Voice reply unavailable");
        return;
      }
      if (!speechSynthesisApi()) {
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

  if (!synth) {
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
    const voice =
      preferredVoiceForLanguage(speechLanguage, state.voiceMode) ||
      (speechLanguage === "english" ? currentVoice() : null);
    if (voice) {
      utterance.voice = voice;
    }
    utterance.lang = voice?.lang || conversationLanguageCode(speechLanguage) || "en-US";
    utterance.volume = 1;
    utterance.rate = state.voiceMode === "female" ? 0.94 : 0.96;
    utterance.pitch = state.voiceMode === "female" ? 1.0 : 0.92;

    utterance.onstart = () => {
      pauseListeningForAssistantSpeech();
      state.speaking = true;
      rememberAssistantSpeech(text);
      startSubtitlePlayback(text, utterance.rate);
      globe.setState({
        speaking: true,
        listening: state.listening,
        awaiting: state.awaitingConfirmation || state.awaitingSelection
      });
      setStatus({
        label: "Assistant speaking",
        pill: "Speaking",
        note: state.awaitingSelection
          ? "A contact choice is waiting."
          : state.awaitingConfirmation
            ? "A confirmation is waiting for yes or no."
          : "Jarvis is responding."
      });
      setMainLine(
        state.awaitingSelection
          ? "Choice ready"
          : state.awaitingConfirmation
            ? "Confirmation ready"
            : "Speaking now"
      );
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

    synth.speak(utterance);
    synth.resume();
  });
}

async function runCommand(transcript, options = {}) {
  const rawTranscript = String(options.rawTranscript || transcript || "").trim();
  const parsedWake = parseWakePhrase(rawTranscript);
  const wakeMatched =
    typeof options.wakeMatched === "boolean" ? options.wakeMatched : parsedWake.wakeMatched;
  const effectiveTranscript = String(
    options.effectiveTranscript || parsedWake.command || transcript || ""
  ).trim();

  if (wakeMatched && !effectiveTranscript) {
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
    const commandBody = JSON.stringify({
      transcript: effectiveTranscript,
      rawTranscript,
      wakeMatched,
      inputSource: options.inputSource || "unknown"
    });

    const sendStreamCommand = async (baseUrl, handlers = {}) => {
      const response = await fetch(apiUrlForBase(baseUrl, "/api/command-stream"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        signal: controller.signal,
        body: commandBody
      });

      if (!response.ok) {
        let message = `Request failed with status ${response.status}.`;
        try {
          const payload = await response.json();
          message = payload.reply || payload.message || message;
        } catch (error) {
          // Ignore parse failures and keep the fallback message.
        }
        throw new Error(message);
      }

      const reader = response.body?.getReader?.();
      if (!reader) {
        throw new Error("Streaming response is unavailable.");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let finalPayload = null;

      const processLine = async (line) => {
        const trimmed = String(line || "").trim();
        if (!trimmed) {
          return;
        }

        let payload = null;
        try {
          payload = JSON.parse(trimmed);
        } catch (error) {
          return;
        }

        if (payload.type === "meta" && typeof handlers.onMeta === "function") {
          await handlers.onMeta(payload);
        }

        if (payload.type === "delta" && typeof handlers.onDelta === "function") {
          await handlers.onDelta(payload);
        }

        if (payload.type === "final") {
          finalPayload = payload.payload || null;
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          await processLine(line);
          newlineIndex = buffer.indexOf("\n");
        }
      }

      if (buffer.trim()) {
        await processLine(buffer);
      }

      if (!finalPayload) {
        throw new Error("Jarvis did not return a final response.");
      }

      return finalPayload;
    };

    const sendCommand = async (baseUrl, handlers = {}) => {
      try {
        return await sendStreamCommand(baseUrl, handlers);
      } catch (error) {
        if (error?.name === "AbortError") {
          throw error;
        }

        const response = await fetch(apiUrlForBase(baseUrl, "/api/command"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          signal: controller.signal,
          body: commandBody
        });

        if (!response.ok) {
          let message = `Request failed with status ${response.status}.`;
          try {
            const payload = await response.json();
            message = payload.reply || payload.message || message;
          } catch (innerError) {
            // Ignore parse failures and keep the fallback message.
          }
          throw new Error(message);
        }

        return response.json();
      }
    };

    let assistantEntry = null;
    let streamedReply = "";
    let streamedSpeechOffset = 0;
    let streamLanguage = activeConversationLanguage();

    let payload;
    if (state.localAgentConnected) {
      try {
        payload = await sendCommand(state.localAgentBaseUrl, {
          onMeta: async (meta) => {
            if (meta?.conversationLanguage) {
              streamLanguage = meta.conversationLanguage;
            }
          },
          onDelta: async (delta) => {
            streamedReply = String(delta?.text || "").trim();
            if (!streamedReply) {
              return;
            }
            if (!assistantEntry) {
              assistantEntry = addHistory("assistant", streamedReply);
            } else {
              updateHistoryEntry(assistantEntry, streamedReply);
            }
            setMainLine("Replying live");
            setStatus({
              label: "Streaming reply",
              pill: "Live",
              note: "Jarvis is replying as the answer arrives."
            });
            streamedSpeechOffset = queueStreamingSpeech(
              streamedReply,
              streamedSpeechOffset,
              streamLanguage
            );
          }
        });
      } catch (error) {
        if (error?.name === "AbortError") {
          throw error;
        }
        state.localAgentConnected = false;
        payload = await sendCommand("", {
          onMeta: async (meta) => {
            if (meta?.conversationLanguage) {
              streamLanguage = meta.conversationLanguage;
            }
          },
          onDelta: async (delta) => {
            streamedReply = String(delta?.text || "").trim();
            if (!streamedReply) {
              return;
            }
            if (!assistantEntry) {
              assistantEntry = addHistory("assistant", streamedReply);
            } else {
              updateHistoryEntry(assistantEntry, streamedReply);
            }
            setMainLine("Replying live");
            setStatus({
              label: "Streaming reply",
              pill: "Live",
              note: "Jarvis is replying as the answer arrives."
            });
            streamedSpeechOffset = queueStreamingSpeech(
              streamedReply,
              streamedSpeechOffset,
              streamLanguage
            );
          }
        });
      }
    } else {
      payload = await sendCommand("", {
        onMeta: async (meta) => {
          if (meta?.conversationLanguage) {
            streamLanguage = meta.conversationLanguage;
          }
        },
        onDelta: async (delta) => {
          streamedReply = String(delta?.text || "").trim();
          if (!streamedReply) {
            return;
          }
          if (!assistantEntry) {
            assistantEntry = addHistory("assistant", streamedReply);
          } else {
            updateHistoryEntry(assistantEntry, streamedReply);
          }
          setMainLine("Replying live");
          setStatus({
            label: "Streaming reply",
            pill: "Live",
            note: "Jarvis is replying as the answer arrives."
          });
          streamedSpeechOffset = queueStreamingSpeech(
            streamedReply,
            streamedSpeechOffset,
            streamLanguage
          );
        }
      });
    }

    if (state.commandAbortController === controller) {
      state.commandAbortController = null;
    }
    if (payload.preferredConversationLanguage) {
      setConversationLanguage(payload.preferredConversationLanguage);
    }
    if (payload.voiceMode === "female" || payload.voiceMode === "male") {
      setVoiceMode(payload.voiceMode);
    }
    state.awaitingConfirmation = Boolean(payload.awaitingConfirmation);
    state.awaitingSelection = Boolean(payload.awaitingSelection);
    if (assistantEntry) {
      updateHistoryEntry(assistantEntry, payload.reply, {
        pending: state.awaitingConfirmation || state.awaitingSelection,
        sources: payload.sources
      });
    } else {
      assistantEntry = addHistory("assistant", payload.reply, {
        pending: state.awaitingConfirmation || state.awaitingSelection,
        sources: payload.sources
      });
    }
    if (payload.uiPanel) {
      setDrawer(payload.uiPanel);
    }
    runClientActions(payload.clientActions);
    setMainLine(
      state.awaitingSelection
        ? "Choose the contact you want"
        : state.awaitingConfirmation
          ? "Awaiting your yes or no"
          : "Response ready"
    );
    globe.setState({
      speaking: false,
      listening: state.listening,
      awaiting: state.awaitingConfirmation || state.awaitingSelection
    });
    const finalLanguage = payload.conversationLanguage || streamLanguage;
    streamedSpeechOffset = queueStreamingSpeech(
      payload.reply,
      streamedSpeechOffset,
      finalLanguage,
      { force: true }
    );
    if (!streamedReply) {
      await speak(payload.reply, {
        language: finalLanguage
      });
    } else if (!state.speaking && state.pendingSpeechText) {
      await flushPendingSpeech();
    }
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
  if (state.awaitingConfirmation || commandWindowOpen() || wakeMatched) {
    return true;
  }
  if (isWakeWordRequiredForContext()) {
    return false;
  }
  if (normalized.length >= 2) {
    return true;
  }
  return false;
}

function ensureRecognition() {
  const desiredKind = preferredRecognitionEngineKind();
  if (state.recognition && state.recognition.kind !== desiredKind) {
    disposeRecognition(state.recognition);
    state.recognition = null;
  }
  if (!state.recognition) {
    state.recognition = createRecognition();
  }
  return state.recognition;
}

async function maybeAutoStartListening() {
  if (!state.voiceSessionEnabled) {
    updateRecognitionBadge();
    return;
  }

  syncRecognitionEngineForContext({
    delayMs: 0
  });

  const supportsPermissions =
    typeof navigator !== "undefined" &&
    navigator.permissions &&
    typeof navigator.permissions.query === "function";

  let permissionState = "prompt";
  if (supportsPermissions) {
    try {
      permissionState = await Promise.race([
        navigator.permissions
          .query({ name: "microphone" })
          .then((status) => status.state)
          .catch(() => "prompt"),
        new Promise((resolve) => {
          window.setTimeout(() => resolve("prompt"), 900);
        })
      ]);
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
  if (shouldUseLocalSpeechRecognition()) {
    return {
      kind: "local"
    };
  }

  const Recognition = browserRecognitionConstructor();
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
  recognition.kind = "browser";
  applyRecognitionLanguage();
  recognition.lang = state.recognitionLang;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let finalTranscript = "";

  recognition.onstart = () => {
    state.listening = true;
    state.hasStartedRecognition = true;
    rememberMicPermission();
    updateRecognitionBadge();
    globe.setState({
      speaking: false,
      listening: true,
      awaiting: state.awaitingConfirmation || state.awaitingSelection
    });
    setStatus({
      label: state.awaitingSelection
        ? "Awaiting contact choice"
        : state.awaitingConfirmation
          ? "Awaiting confirmation"
          : "Listening",
      pill: state.awaitingSelection ? "Choose" : state.awaitingConfirmation ? "Confirm" : "Listening",
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
    const liveProcessedTranscript = repairRecognizedTranscript(liveTranscript);

    const liveWake = parseWakePhrase(liveProcessedTranscript);
    const liveCommand = liveWake.command || liveProcessedTranscript;

    if (state.speaking) {
      if (isStopCommand(liveProcessedTranscript, { requireWake: true })) {
        stopCurrentConversation();
        finalTranscript = "";
        return;
      }
      finalTranscript = "";
      return;
    }

    if (
      liveProcessedTranscript &&
      (transcriptLooksLikeAssistantEcho(liveProcessedTranscript) ||
        shouldIgnoreDuringEchoTail(liveProcessedTranscript))
    ) {
      if (!state.awaitingConfirmation && !state.awaitingSelection) {
        setMainLine(defaultHeadline());
      }
      finalTranscript = "";
      return;
    }

    if (interimTranscript) {
      const repairedInterim = repairRecognizedTranscript(interimTranscript);
      setMainLine(repairedInterim);
      setSubtitle(repairedInterim);
    } else if (!state.speaking && !state.awaitingConfirmation && !state.awaitingSelection) {
      clearSubtitle();
    }

    if (!finalTranscript) {
      return;
    }

    const acceptedRawTranscript = finalTranscript;
    finalTranscript = "";
    await handleRecognizedTranscript(acceptedRawTranscript);
  };

  recognition.onerror = (event) => {
    state.listening = false;
    updateRecognitionBadge();
    globe.setState({
      speaking: state.speaking,
      listening: false,
      awaiting: state.awaitingConfirmation || state.awaitingSelection
    });
    if (!state.speaking && !state.awaitingConfirmation && !state.awaitingSelection) {
      clearSubtitle();
    }

    if (state.micPausedForAssistantSpeech) {
      return;
    }

    if (state.speaking && state.allowBargeIn) {
      window.setTimeout(() => {
        if (state.speaking && !state.listening) {
          startListening(true);
        }
      }, 120);
      return;
    }

    if (
      state.recognitionRestartPending
    ) {
      return;
    }

    if (
      state.voiceSessionEnabled &&
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
      awaiting: state.awaitingConfirmation || state.awaitingSelection
    });

    if (state.micPausedForAssistantSpeech) {
      return;
    }

    if (state.speaking && state.allowBargeIn) {
      window.setTimeout(() => {
        if (state.speaking && !state.listening) {
          startListening(true);
        }
      }, 160);
      return;
    }

    if (state.recognitionRestartPending && !state.speaking) {
      state.recognitionRestartPending = false;
      if (!state.voiceSessionEnabled) {
        return;
      }
      window.setTimeout(() => {
        if (!state.speaking && !state.listening) {
          startListening();
        }
      }, 90);
      return;
    }

    if (state.voiceSessionEnabled && state.handsFree && !state.speaking) {
      scheduleListeningResume(420);
    }
  };

  return recognition;
}

function startListening(allowDuringSpeech = false) {
  if (shouldUseLocalSpeechRecognition()) {
    if (!state.voiceSessionEnabled) {
      return;
    }
    if (state.speaking && !allowDuringSpeech) {
      return;
    }
    void startLocalSpeechCapture().catch((error) => {
      state.listening = false;
      updateRecognitionBadge();
      setStatus({
        label: "Microphone problem",
        pill: "Error",
        note: String(error?.message || error || "Jarvis could not start local speech capture.")
      });
      setMainLine("Microphone setup is blocked");
    });
    return;
  }

  const recognition = ensureRecognition();
  if (!recognition || state.listening || !state.voiceSessionEnabled) {
    return;
  }
  if (state.speaking && !allowDuringSpeech) {
    return;
  }
  try {
    applyRecognitionLanguage();
    recognition.start();
  } catch (error) {
    // Browsers throw if start is called while already active.
  }
}

function stopListening() {
  if (shouldUseLocalSpeechRecognition()) {
    stopLocalSpeechCapture();
    return;
  }

  if (!state.recognition || !state.listening) {
    return;
  }
  state.recognition.stop();
}

function bindEvents() {
  const unlockOnInteraction = () => {
    unlockSpeech();
  };
  const handleDesktopFocusShift = () => {
    syncRecognitionEngineForContext({
      delayMs: document.hidden || !windowFocused() ? 40 : 140
    });
    void syncCompactPresence();
  };

  document.addEventListener("pointerdown", unlockOnInteraction, { passive: true });
  document.addEventListener("keydown", unlockOnInteraction);
  document.addEventListener("visibilitychange", handleDesktopFocusShift);
  window.addEventListener("focus", handleDesktopFocusShift);
  window.addEventListener("blur", handleDesktopFocusShift);

  if (desktopBridge()?.onQuickSummon) {
    desktopBridge().onQuickSummon((payload) => {
      unlockSpeech();
      extendCommandWindow();
      setDrawer("none");
      setStatus({
        label: "Jarvis summoned",
        pill: "Ready",
        note: payload?.shortcut
          ? `${payload.shortcut} opened Jarvis instantly. Speak now or type a command.`
          : "Jarvis is ready. Speak now or type a command."
      });
      setMainLine("Jarvis is ready");
      setSubtitle("Listening...");

      if (state.voiceSessionEnabled && !state.listening && !state.speaking) {
        startListening();
        return;
      }

      dom.textCommand?.focus();
      dom.textCommand?.select?.();
    });
  }

  window.setInterval(() => {
    if (
      state.voiceSessionEnabled &&
      state.handsFree &&
      state.recognition &&
      !state.speaking &&
      !state.listening
    ) {
      startListening();
    }
  }, LISTENING_WATCHDOG_MS);

  dom.startButton.addEventListener("click", async () => {
    await beginVoiceCapture();
  });
  dom.dockStartButton.addEventListener("click", async () => {
    await beginVoiceCapture();
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
    if (state.handsFree && state.voiceSessionEnabled) {
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
    await runCommand(transcript, {
      rawTranscript: transcript,
      inputSource: "text"
    });
  });

  dom.dockTextCommandForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    unlockSpeech();
    const transcript = dom.dockTextCommand.value.trim();
    if (!transcript) {
      return;
    }
    dom.dockTextCommand.value = "";
    await runCommand(transcript, {
      rawTranscript: transcript,
      inputSource: "text"
    });
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

  [
    [dom.desktopSetupToggle, "setup"],
    [dom.desktopVoiceToggle, "voice"],
    [dom.desktopCommandsToggle, "commands"],
    [dom.desktopHistoryToggle, "history"]
  ].forEach(([button, mode]) => {
    if (!button) {
      return;
    }
    button.addEventListener("click", () => {
      unlockSpeech();
      setDrawer(state.drawerMode === mode ? "none" : mode);
    });
  });

  if (dom.dynamicIslandToggle) {
    dom.dynamicIslandToggle.addEventListener("click", async () => {
      unlockSpeech();
      await setCompactMode(!state.compactMode);
    });
  }

  if (dom.desktopMicButton) {
    dom.desktopMicButton.addEventListener("click", async () => {
      unlockSpeech();
      const granted = await ensureDesktopMicrophonePermission();
      if (granted) {
        rememberMicPermission();
        setStatus({
          label: "Microphone ready",
          pill: "Ready",
          note: "Jarvis can now listen on this laptop."
        });
      }
    });
  }

  if (dom.desktopAccessibilityButton) {
    dom.desktopAccessibilityButton.addEventListener("click", async () => {
      unlockSpeech();
      await promptDesktopAccessibility();
    });
  }

  if (dom.desktopAutomationButton) {
    dom.desktopAutomationButton.addEventListener("click", async () => {
      unlockSpeech();
      await openDesktopPermissionSettings("automation");
    });
  }

  if (dom.desktopRefreshButton) {
    dom.desktopRefreshButton.addEventListener("click", async () => {
      unlockSpeech();
      await refreshDesktopPermissionsOnly();
    });
  }

  if (dom.desktopLaunchAtLogin) {
    dom.desktopLaunchAtLogin.addEventListener("change", async (event) => {
      unlockSpeech();
      await setDesktopLaunchAtLogin(event.target.checked);
    });
  }

  if (dom.windowMinimizeButton) {
    dom.windowMinimizeButton.addEventListener("click", async () => {
      unlockSpeech();
      if (isDesktopApp()) {
        await desktopBridge().minimizeWindow();
      }
    });
  }

  if (dom.windowMaximizeButton) {
    dom.windowMaximizeButton.addEventListener("click", async () => {
      unlockSpeech();
      if (isDesktopApp()) {
        state.desktopWindowState = await desktopBridge().toggleMaximizeWindow();
        await refreshDesktopWindowState();
      }
    });
  }

  if (dom.windowCloseButton) {
    dom.windowCloseButton.addEventListener("click", async () => {
      unlockSpeech();
      if (isDesktopApp()) {
        await desktopBridge().closeWindow();
      }
    });
  }
}

function renderQuickCommands() {
  dom.quickCommands.innerHTML = "";
  const commands = [
    ...(state.config?.memory?.recentCommands || []),
    ...(state.config?.memory?.recentApps || []).map((appName) => `open ${appName}`),
    ...(state.config?.memory?.recentContacts || []).map(
      (contactName) => `message ${contactName} saying hello`
    ),
    ...(state.config?.examples || []),
    ...(state.config?.customActions || []).map((action) => action.phrase)
  ];

  for (const command of Array.from(new Set(commands.filter(Boolean))).slice(0, 8)) {
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
  const cloudConfig = await fetchJson("/api/config");
  state.cloudConfig = cloudConfig;
  state.config = await connectLocalAgent(cloudConfig);
  setConversationLanguage(state.config?.conversationLanguage || "auto", {
    restartRecognition: false
  });
  state.serverTtsDisabled = state.config?.tts?.available === false;
  state.serverTtsError = state.config?.tts?.error || "";
  dom.assistantName.textContent = state.config.assistantName;
  updateVoiceBadge();
  updateVoiceLockSummary();
  renderQuickCommands();

  addHistory(
    "assistant",
    `${state.config.assistantName} is ready for ${
      state.config.user?.displayName || "you"
    }. ${
      isDesktopApp()
        ? "Desktop mode is active on this laptop. Grant the setup permissions once and Jarvis will use server voices and native controls here."
        : state.localAgentConnected
        ? "This device helper is connected, so native laptop actions are enabled here."
        : state.config?.localAgent?.enabled
          ? "Cloud mode is active. Start the local device helper on this laptop to enable apps, WhatsApp, Contacts, and system controls."
          : "Cloud mode is active. Browser-safe commands are ready on this device."
    }`
  );
  setMainLine(defaultHeadline());
}

async function boot() {
  try {
    bindEvents();
    setVoiceMode("female");
    setStatus({
      label: "Initializing",
      pill: "Booting",
      note: "Loading the local assistant shell."
    });

    await loadConfig();
    await refreshDesktopEnvironment();
    if (isDesktopApp() && preferredMenuBarOnlyMode() && !state.menuBarOnlyMode) {
      await setMenuBarOnlyMode(true);
    }
    await refreshDesktopWindowState();
    if (preferredCompactMode() && !state.compactMode) {
      await setCompactMode(true);
    }
    if (preferredVoiceSessionEnabled() && userPreviouslyEnabledMic()) {
      state.voiceSessionEnabled = true;
      extendCommandWindow();
      updateRecognitionBadge();
    }
    collectVoices();
    const synth = speechSynthesisApi();
    if (synth) {
      if (typeof synth.addEventListener === "function") {
        synth.addEventListener("voiceschanged", collectVoices);
      } else {
        synth.onvoiceschanged = collectVoices;
      }
    }
    state.recognition = ensureRecognition();
    setStatus({
      label: "Awaiting command",
      pill: "Idle",
      note: state.voiceSessionEnabled
        ? 'Voice standby is on. Say "Hey Jarvis" and speak naturally.'
        : 'Press Start Voice when you want Jarvis to listen. The mic now stays off until you start it.'
    });
    void maybeAutoStartListening();
  } catch (error) {
    console.error("Jarvis boot failed", error);
    setStatus({
      label: "Startup problem",
      pill: "Error",
      note: String(error?.message || error || "Unknown startup error.")
    });
    addHistory("assistant", `I hit a startup problem: ${String(error?.message || error)}`);
  }
}

const globe = new GlobeAnimation(dom.canvas);
boot();
