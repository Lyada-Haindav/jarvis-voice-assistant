const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const { exec, execFile } = require("child_process");

const HOST = process.env.HOST || (process.env.RENDER ? "0.0.0.0" : "127.0.0.1");
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "static");
const CONFIG_PATH = path.join(__dirname, "config", "assistant.config.json");
const ENV_PATH = path.join(__dirname, ".env");
const USER_PROFILE_PATH = path.join(__dirname, "data", "user-profile.json");
const TTS_CACHE_DIR = path.join(os.tmpdir(), "jarvis-tts");
const CONFIRMATION_TTL_MS = 60_000;
const MAX_KNOWLEDGE_TURNS = 8;
const MAX_CONVERSATION_TURNS = 20;
const KOKORO_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

const NATIVE_TTS_VOICES = {
  female: ["Flo (English (US))", "Samantha", "Karen", "Moira", "Tessa"],
  male: ["Eddy (English (US))", "Daniel"]
};

const KOKORO_TTS_VOICES = {
  female: {
    id: "af_heart",
    label: "Heart (Kokoro)"
  },
  male: {
    id: "am_michael",
    label: "Michael (Kokoro)"
  }
};

const DEFAULT_CONFIG = {
  assistantName: "Jarvis",
  messageDelivery: "draft",
  knowledge: {
    enabled: true,
    provider: "auto",
    model: "gemini-2.5-flash",
    useGoogleSearch: true
  },
  contacts: {
    dad: {
      displayName: "Dad",
      phone: "91XXXXXXXXXX",
      aliases: ["father", "papa"]
    }
  },
  apps: {
    whatsapp: "WhatsApp",
    chrome: "Google Chrome",
    safari: "Safari",
    spotify: "Spotify",
    terminal: "Terminal",
    vscode: "Visual Studio Code",
    settings: "System Settings"
  },
  sites: {
    youtube: "https://www.youtube.com",
    github: "https://github.com",
    chatgpt: "https://chatgpt.com",
    gmail: "https://mail.google.com",
    whatsappweb: "https://web.whatsapp.com"
  },
  folders: {
    downloads: "~/Downloads",
    desktop: "~/Desktop",
    documents: "~/Documents"
  },
  spotify: {
    likedSongsUri: "spotify:collection:tracks"
  },
  customActions: [
    {
      phrase: "lock the screen",
      description: "Lock the Mac screen",
      command:
        "osascript -e 'tell application \"System Events\" to keystroke \"q\" using {control down, command down}'",
      requiresConfirmation: true
    },
    {
      phrase: "take a screenshot",
      description: "Take an interactive screenshot",
      command:
        "screencapture -i ~/Desktop/jarvis-$(date +%Y%m%d-%H%M%S).png",
      requiresConfirmation: false
    },
    {
      phrase: "mute the volume",
      description: "Mute the volume",
      command: "osascript -e 'set volume with output muted'",
      requiresConfirmation: false
    },
    {
      phrase: "unmute the volume",
      description: "Unmute the volume",
      command: "osascript -e 'set volume without output muted'",
      requiresConfirmation: false
    }
  ]
};

const SETTINGS_PANELS = {
  settings: {
    label: "System Settings",
    targets: ["/System/Applications/System Settings.app"],
    aliases: ["settings", "system settings", "preferences", "system preferences"]
  },
  sound: {
    label: "Sound settings",
    targets: ["/System/Library/PreferencePanes/Sound.prefPane"],
    aliases: [
      "sound",
      "sound settings",
      "audio",
      "audio settings",
      "speaker",
      "speaker settings",
      "volume settings"
    ]
  },
  display: {
    label: "Display settings",
    targets: ["/System/Library/PreferencePanes/Displays.prefPane"],
    aliases: [
      "display",
      "display settings",
      "displays",
      "screen",
      "screen settings",
      "monitor",
      "monitor settings"
    ]
  },
  appearance: {
    label: "Appearance settings",
    targets: ["/System/Library/PreferencePanes/Appearance.prefPane"],
    aliases: [
      "appearance",
      "appearance settings",
      "theme",
      "theme settings",
      "dark mode settings",
      "light mode settings"
    ]
  },
  network: {
    label: "Network settings",
    targets: ["/System/Library/PreferencePanes/Network.prefPane"],
    aliases: [
      "network",
      "network settings",
      "wifi settings",
      "wi fi settings",
      "internet settings",
      "internet",
      "wifi",
      "wi fi"
    ]
  },
  bluetooth: {
    label: "Bluetooth settings",
    targets: ["/System/Library/PreferencePanes/Bluetooth.prefPane"],
    aliases: ["bluetooth", "bluetooth settings"]
  },
  battery: {
    label: "Battery settings",
    targets: ["/System/Library/PreferencePanes/Battery.prefPane"],
    aliases: ["battery", "battery settings", "power settings", "power"]
  },
  notifications: {
    label: "Notifications settings",
    targets: ["/System/Library/PreferencePanes/Notifications.prefPane"],
    aliases: ["notifications", "notifications settings", "notification settings"]
  },
  privacy: {
    label: "Privacy & Security settings",
    targets: ["/System/Library/PreferencePanes/Security.prefPane"],
    aliases: [
      "privacy",
      "privacy settings",
      "security",
      "security settings",
      "privacy and security",
      "privacy security"
    ]
  },
  keyboard: {
    label: "Keyboard settings",
    targets: ["/System/Library/PreferencePanes/Keyboard.prefPane"],
    aliases: ["keyboard", "keyboard settings"]
  },
  mouse: {
    label: "Mouse settings",
    targets: ["/System/Library/PreferencePanes/Mouse.prefPane"],
    aliases: ["mouse", "mouse settings"]
  },
  trackpad: {
    label: "Trackpad settings",
    targets: ["/System/Library/PreferencePanes/Trackpad.prefPane"],
    aliases: ["trackpad", "trackpad settings"]
  },
  wallpaper: {
    label: "Wallpaper settings",
    targets: ["/System/Library/PreferencePanes/DesktopScreenEffectsPref.prefPane"],
    aliases: ["wallpaper", "wallpaper settings", "desktop", "desktop settings"]
  },
  accounts: {
    label: "Users & Groups settings",
    targets: ["/System/Library/PreferencePanes/Accounts.prefPane"],
    aliases: ["accounts", "account settings", "users", "users and groups", "login settings"]
  },
  softwareupdate: {
    label: "Software Update settings",
    targets: ["/System/Library/PreferencePanes/SoftwareUpdate.prefPane"],
    aliases: ["software update", "updates", "update settings", "software update settings"]
  }
};

const WIFI_SERVICE_CANDIDATES = ["Wi-Fi", "WiFi", "AirPort"];

function createSessionContext() {
  return {
    lastIntentType: "",
    lastAppName: "",
    lastUrl: "",
    lastPath: "",
    lastSearchQuery: "",
    lastShortcutName: "",
    lastSpotifyAction: "",
    lastContact: null,
    lastWhatsappMessage: "",
    lastUserCommand: "",
    lastAssistantReply: "",
    updatedAt: 0
  };
}

const state = {
  pendingAction: null,
  knowledgeHistory: [],
  conversationHistory: [],
  sessionContext: createSessionContext(),
  kokoroModulePromise: null,
  kokoroTtsPromise: null,
  kokoroWarmupPromise: null,
  kokoroStatus: "idle",
  kokoroLastError: "",
  speechQueue: Promise.resolve()
};

loadDotEnv();

function kokoroServerTtsEnabled() {
  if (process.env.KOKORO_SERVER_TTS === "1") {
    return true;
  }

  if (process.env.KOKORO_SERVER_TTS === "0") {
    return false;
  }

  return true;
}

function loadDotEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    return;
  }

  const text = fs.readFileSync(ENV_PATH, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    const value =
      rawValue.startsWith('"') && rawValue.endsWith('"')
        ? rawValue.slice(1, -1)
        : rawValue.startsWith("'") && rawValue.endsWith("'")
          ? rawValue.slice(1, -1)
          : rawValue;

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function readConfig() {
  try {
    const text = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(text);
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      knowledge: {
        ...DEFAULT_CONFIG.knowledge,
        ...(parsed.knowledge || {})
      },
      contacts: { ...DEFAULT_CONFIG.contacts, ...(parsed.contacts || {}) },
      apps: { ...DEFAULT_CONFIG.apps, ...(parsed.apps || {}) },
      sites: { ...DEFAULT_CONFIG.sites, ...(parsed.sites || {}) },
      folders: { ...DEFAULT_CONFIG.folders, ...(parsed.folders || {}) },
      spotify: {
        ...DEFAULT_CONFIG.spotify,
        ...(parsed.spotify || {})
      },
      customActions: Array.isArray(parsed.customActions)
        ? parsed.customActions
        : DEFAULT_CONFIG.customActions
    };
  } catch (error) {
    return DEFAULT_CONFIG;
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8"
  });
  response.end(text);
}

async function serveStatic(response, pathname) {
  const targetPath =
    pathname === "/"
      ? path.join(PUBLIC_DIR, "index.html")
      : path.join(PUBLIC_DIR, pathname.replace(/^\/+/, ""));

  const normalized = path.normalize(targetPath);
  if (!normalized.startsWith(PUBLIC_DIR)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  try {
    const stats = await fsp.stat(normalized);
    if (stats.isDirectory()) {
      sendText(response, 403, "Forbidden");
      return;
    }
    const ext = path.extname(normalized).toLowerCase();
    const body = await fsp.readFile(normalized);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(body);
  } catch (error) {
    sendText(response, 404, "Not Found");
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large."));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripWakeWords(text, assistantName) {
  const normalizedName = normalizeText(assistantName || "jarvis");
  let cleaned = String(text || "").trim();
  const patterns = [
    new RegExp(`^hey\\s+${normalizedName}[,\\s:.-]*`, "i"),
    new RegExp(`^hi\\s+${normalizedName}[,\\s:.-]*`, "i"),
    new RegExp(`^${normalizedName}[,\\s:.-]*`, "i"),
    /^please\s+/i,
    /^can you\s+/i,
    /^could you\s+/i
  ];
  for (const pattern of patterns) {
    cleaned = cleaned.replace(pattern, "").trim();
  }
  return cleaned || text;
}

function isAffirmative(text) {
  return /^(yes|yeah|yep|confirm|do it|send it|go ahead|proceed|sure)$/.test(
    normalizeText(text)
  );
}

function isNegative(text) {
  return /^(no|nope|cancel|stop|never mind|dont|don't)$/.test(
    normalizeText(text)
  );
}

function titleCase(text) {
  return String(text || "")
    .split(" ")
    .filter(Boolean)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1))
    .join(" ");
}

function publicConfig(config) {
  const provider = activeKnowledgeProvider(config);
  const profile = readUserProfile();
  return {
    assistantName: config.assistantName,
    user: {
      displayName: currentUserDisplayName(profile)
    },
    tts: publicTtsConfig(),
    messageDelivery: config.messageDelivery,
    knowledge: {
      enabled: Boolean(config.knowledge?.enabled),
      provider,
      model: activeKnowledgeModel(config),
      status: knowledgeStatus(config)
    },
    contacts: Object.entries(config.contacts || {}).map(([key, contact]) => ({
      key,
      displayName: contact.displayName || titleCase(key)
    })),
    customActions: (config.customActions || []).map((action) => ({
      phrase: action.phrase,
      description: action.description || action.phrase,
      requiresConfirmation: Boolean(action.requiresConfirmation)
    })),
    examples: [
      `open WhatsApp`,
      `message dad saying I will be late by ten minutes`,
      `open Spotify and play my liked songs`,
      `next song`,
      `set volume to 40`,
      `close Spotify`,
      `run shortcut Movie Mode`,
      `show commands`
    ]
  };
}

function createReply(message, extras = {}) {
  return {
    reply: message,
    ...extras
  };
}

function rememberPending(action, prompt) {
  state.pendingAction = {
    ...action,
    createdAt: Date.now()
  };
  if (action?.type === "whatsapp" && action.contact) {
    rememberSessionContext({
      lastIntentType: "whatsapp",
      lastContact: cloneContactForContext(action.contact),
      lastWhatsappMessage: action.message || state.sessionContext.lastWhatsappMessage
    });
  }
  return createReply(prompt, {
    awaitingConfirmation: true,
    status: "needs_confirmation"
  });
}

function clearExpiredPending() {
  if (
    state.pendingAction &&
    Date.now() - state.pendingAction.createdAt > CONFIRMATION_TTL_MS
  ) {
    state.pendingAction = null;
  }
}

function defaultUserProfile() {
  const rawUsername =
    os.userInfo().username || process.env.USER || process.env.USERNAME || "there";
  const detectedName = titleCase(
    String(rawUsername)
      .replace(/[._-]+/g, " ")
      .replace(/\d+/g, " ")
      .trim() || "there"
  );

  return {
    username: rawUsername,
    detectedName,
    preferredName: ""
  };
}

function readUserProfile() {
  const defaults = defaultUserProfile();
  try {
    const text = fs.readFileSync(USER_PROFILE_PATH, "utf8");
    const parsed = JSON.parse(text);
    return {
      ...defaults,
      ...(parsed || {})
    };
  } catch (error) {
    return defaults;
  }
}

async function writeUserProfile(profile) {
  await fsp.mkdir(path.dirname(USER_PROFILE_PATH), { recursive: true });
  await fsp.writeFile(
    USER_PROFILE_PATH,
    JSON.stringify(
      {
        username: profile.username || defaultUserProfile().username,
        detectedName: profile.detectedName || defaultUserProfile().detectedName,
        preferredName: profile.preferredName || ""
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
}

function currentUserDisplayName(profile = readUserProfile()) {
  return (
    String(profile.preferredName || "").trim() ||
    String(profile.detectedName || "").trim() ||
    "there"
  );
}

function nativeTtsConfig() {
  if (process.platform !== "darwin") {
    return {
      provider: "browser",
      femaleVoice: "",
      maleVoice: ""
    };
  }

  return {
    provider: "native_mac",
    femaleVoice: NATIVE_TTS_VOICES.female[0],
    maleVoice: NATIVE_TTS_VOICES.male[0]
  };
}

function publicTtsConfig() {
  if (!kokoroServerTtsEnabled()) {
    return {
      provider: "browser",
      femaleVoice: "",
      maleVoice: "",
      available: false,
      status: "disabled",
      error: "Server-side Kokoro TTS is disabled on this host.",
      fallbackProvider: "browser"
    };
  }

  const available = state.kokoroStatus === "ready";
  return {
    provider: "kokoro_server",
    femaleVoice: KOKORO_TTS_VOICES.female.label,
    maleVoice: KOKORO_TTS_VOICES.male.label,
    available,
    status: state.kokoroStatus,
    error: available ? "" : state.kokoroLastError,
    fallbackProvider: "browser"
  };
}

function isOpenRouterKey(value) {
  return /^sk-or-v1-/i.test(String(value || "").trim());
}

function geminiApiKey() {
  const candidate = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  return isOpenRouterKey(candidate) ? "" : candidate;
}

function openRouterApiKey() {
  if (process.env.OPENROUTER_API_KEY) {
    return process.env.OPENROUTER_API_KEY;
  }

  const fallback = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  return isOpenRouterKey(fallback) ? fallback : "";
}

function activeKnowledgeProvider(config) {
  const preferred = normalizeText(config.knowledge?.provider || "auto");
  const hasGemini = Boolean(geminiApiKey());
  const hasOpenRouter = Boolean(openRouterApiKey());

  if (preferred === "openrouter") {
    return hasOpenRouter ? "openrouter" : hasGemini ? "gemini" : "openrouter";
  }

  if (preferred === "gemini") {
    return hasGemini ? "gemini" : hasOpenRouter ? "openrouter" : "gemini";
  }

  return hasOpenRouter ? "openrouter" : hasGemini ? "gemini" : "gemini";
}

function configuredOpenRouterModel(config) {
  if (process.env.OPENROUTER_MODEL) {
    return process.env.OPENROUTER_MODEL;
  }

  return normalizeText(config.knowledge?.provider || "") === "openrouter"
    ? String(config.knowledge?.model || "").trim()
    : "";
}

function activeKnowledgeModel(config) {
  const provider = activeKnowledgeProvider(config);
  if (provider === "openrouter") {
    return configuredOpenRouterModel(config) || "default";
  }
  return config.knowledge?.model || DEFAULT_CONFIG.knowledge.model;
}

function providerDisplayName(provider) {
  return provider === "openrouter" ? "OpenRouter" : "Google AI";
}

function knowledgeStatus(config) {
  if (config.knowledge?.enabled === false) {
    return "disabled";
  }
  return geminiApiKey() || openRouterApiKey() ? "online" : "needs_api_key";
}

function extractProviderErrorMessage(payload, statusCode, provider) {
  return (
    payload?.error?.message ||
    payload?.message ||
    `${providerDisplayName(provider)} request failed with status ${statusCode}.`
  );
}

function isQuotaExceededMessage(message, statusCode) {
  return (
    statusCode === 429 ||
    /quota|rate limit|billing|resource exhausted|too many requests/i.test(
      String(message || "")
    )
  );
}

function quotaExceededReply(provider = "gemini") {
  return createReply(
    `${providerDisplayName(provider)} is unavailable for open-ended AI commands right now. Built-in laptop commands still work, but AI requests need fresh quota, credits, billing, or another API key.`
  );
}

function rememberKnowledgeTurn(role, text) {
  if (!text) {
    return;
  }

  state.knowledgeHistory.push({ role, text });
  if (state.knowledgeHistory.length > MAX_KNOWLEDGE_TURNS) {
    state.knowledgeHistory.splice(
      0,
      state.knowledgeHistory.length - MAX_KNOWLEDGE_TURNS
    );
  }
}

function knowledgeHistoryAsPrompt() {
  if (!state.knowledgeHistory.length) {
    return "";
  }

  return state.knowledgeHistory
    .map((turn) => `${turn.role === "assistant" ? "Assistant" : "User"}: ${turn.text}`)
    .join("\n");
}

function rememberConversationTurn(role, text) {
  if (!text) {
    return;
  }

  state.conversationHistory.push({ role, text });
  if (state.conversationHistory.length > MAX_CONVERSATION_TURNS) {
    state.conversationHistory.splice(
      0,
      state.conversationHistory.length - MAX_CONVERSATION_TURNS
    );
  }
}

function conversationHistoryAsPrompt() {
  if (!state.conversationHistory.length) {
    return "";
  }

  return state.conversationHistory
    .map((turn) => `${turn.role === "assistant" ? "Assistant" : "User"}: ${turn.text}`)
    .join("\n");
}

function contactLabel(contact) {
  if (!contact) {
    return "that contact";
  }
  if (contact.displayName) {
    return contact.displayName;
  }
  if (contact.key) {
    return titleCase(contact.key);
  }
  return "that contact";
}

function cleanWhatsappMessage(message) {
  return String(message || "")
    .replace(/^\s*(saying|that|with message)\s+/i, "")
    .replace(/\s+(on|via|in)\s+whatsapp\s*$/i, "")
    .trim();
}

function cloneContactForContext(contact) {
  if (!contact) {
    return null;
  }

  return {
    key: contact.key || "",
    displayName: contact.displayName || (contact.key ? titleCase(contact.key) : ""),
    phone: contact.phone || "",
    aliases: Array.isArray(contact.aliases) ? [...contact.aliases] : []
  };
}

function hasRealPhoneNumber(phone) {
  const rawValue = String(phone || "");
  const digits = rawValue.replace(/[^\d]/g, "");
  return digits.length >= 8 && !/[xX]{4,}/.test(rawValue);
}

function rememberSessionContext(update) {
  state.sessionContext = {
    ...state.sessionContext,
    ...update,
    updatedAt: Date.now()
  };
}

function resolveContact(config, spokenName) {
  const normalizedTarget = normalizeText(spokenName);
  for (const [key, contact] of Object.entries(config.contacts || {})) {
    const aliases = [
      key,
      contact.displayName || "",
      ...(Array.isArray(contact.aliases) ? contact.aliases : [])
    ]
      .map(normalizeText)
      .filter(Boolean);
    if (aliases.includes(normalizedTarget)) {
      return {
        key,
        ...contact
      };
    }
  }
  return null;
}

function findContactByPrefix(config, remainder) {
  const candidates = [];
  for (const [key, contact] of Object.entries(config.contacts || {})) {
    const aliases = [
      key,
      contact.displayName || "",
      ...(Array.isArray(contact.aliases) ? contact.aliases : [])
    ]
      .map((alias) => alias.trim())
      .filter(Boolean);
    for (const alias of aliases) {
      candidates.push({
        contact: {
          key,
          ...contact
        },
        alias
      });
    }
  }
  candidates.sort((left, right) => right.alias.length - left.alias.length);

  const normalizedRemainder = normalizeText(remainder);
  for (const candidate of candidates) {
    const normalizedAlias = normalizeText(candidate.alias);
    if (
      normalizedRemainder === normalizedAlias ||
      normalizedRemainder.startsWith(`${normalizedAlias} `)
    ) {
      const message = remainder
        .slice(candidate.alias.length)
        .replace(/^\s*(saying|that|with message)\s+/i, "")
        .trim();
      return {
        contact: candidate.contact,
        message
      };
    }
  }
  return null;
}

function finalizeMessageIntent(config, spokenName, message) {
  const contact = resolveContact(config, spokenName);
  const cleanedMessage = cleanWhatsappMessage(message);

  if (!contact) {
    return {
      type: "whatsappLookup",
      spokenName: spokenName.trim(),
      message: cleanedMessage
    };
  }

  if (!cleanedMessage) {
    return createReply(
      `Tell me what message to send to ${contactLabel(contact)}.`
    );
  }

  return {
    type: "whatsapp",
    contact,
    message: cleanedMessage
  };
}

function parseMessageIntent(rawText, config) {
  const trimmed = rawText.trim();
  const withPreambleRemoved = trimmed.replace(
    /^(open whatsapp and |open whatsapp then )/i,
    ""
  );

  const patternMatches = [
    /^(?:send(?: a)?(?: whatsapp)?(?: message)? to)\s+(.+?)\s+(?:saying|that|with message)\s+(.+)$/i,
    /^(?:send(?: a)?(?: whatsapp)?(?: message)? to)\s+(.+?)\s+(.+)$/i,
    /^(?:send|message|text)\s+(.+?)\s+(?:on|via|in)\s+whatsapp\s+(?:saying|that|with message)?\s*(.+)$/i,
    /^(?:send|message|text)\s+(.+?)\s+(?:a\s+)?whatsapp\s+(?:saying|that|with message)?\s*(.+)$/i,
    /^(?:tell)\s+(.+?)\s+(?:on|via|in)\s+whatsapp\s+(?:that|saying)?\s*(.+)$/i,
    /^(?:whatsapp)\s+(.+?)\s+(?:saying|that|with message)?\s*(.+)$/i
  ];

  for (const pattern of patternMatches) {
    const match = withPreambleRemoved.match(pattern);
    if (!match) {
      continue;
    }
    return finalizeMessageIntent(config, match[1], match[2]);
  }

  const explicitToWhatsapp = withPreambleRemoved.match(
    /^(?:send|message|text)\s+(?:a\s+)?message\s+to\s+(.+?)\s+(?:on|via|in)\s+whatsapp\s+(?:saying|that|with message)?\s*(.+)$/i
  );
  if (explicitToWhatsapp) {
    return finalizeMessageIntent(
      config,
      explicitToWhatsapp[1],
      explicitToWhatsapp[2]
    );
  }

  const directPrefix = withPreambleRemoved.match(/^(?:message|whatsapp)\s+(.+)$/i);
  if (directPrefix) {
    const parsed = findContactByPrefix(config, directPrefix[1]);
    if (parsed && parsed.message) {
      return {
        type: "whatsapp",
        contact: parsed.contact,
        message: parsed.message
      };
    }
  }

  return null;
}

function parseFollowUpMessageIntent(rawText) {
  const lastContact = state.sessionContext.lastContact;
  if (!lastContact) {
    return null;
  }

  const patterns = [
    /^(?:send|message|text|whatsapp|reply(?: to)?|answer)\s+(?:him|her|them)\s+(?:saying|that|with message)\s+(.+)$/i,
    /^(?:tell)\s+(?:him|her|them)\s+(.+)$/i,
    /^(?:reply|answer)\s+(?:saying|that|with message)\s+(.+)$/i,
    /^(?:send|message|text|whatsapp)\s+(?:another|one more|again)(?:\s+message)?\s+(?:saying|that|with message)\s+(.+)$/i,
    /^(?:send|message|text|whatsapp)\s+(?:another|one more|again)\s+to\s+(?:him|her|them)\s+(?:saying|that|with message)\s+(.+)$/i
  ];

  for (const pattern of patterns) {
    const match = rawText.match(pattern);
    if (!match) {
      continue;
    }

    const message = cleanWhatsappMessage(match[1]);
    if (!message) {
      continue;
    }

    return {
      type: "whatsapp",
      contact: cloneContactForContext(lastContact),
      message
    };
  }

  return null;
}

function parseSpotifyIntent(rawText) {
  const normalized = normalizeText(rawText);

  if (
    /^(?:open spotify and )?(?:play|start|resume)(?: songs from)?(?: my)? liked songs(?: on spotify)?$/.test(
      normalized
    ) ||
    /^(?:open spotify and )?play songs from liked songs$/.test(normalized)
  ) {
    return {
      type: "spotifyControl",
      action: "likedSongs"
    };
  }

  if (/^(?:play|resume)(?: spotify)?$/.test(normalized)) {
    return {
      type: "spotifyControl",
      action: "play"
    };
  }

  if (/^(?:pause|stop)(?: spotify)?$/.test(normalized)) {
    return {
      type: "spotifyControl",
      action: "pause"
    };
  }

  if (/^(?:next|skip)(?: song| track)?(?: on spotify)?$/.test(normalized)) {
    return {
      type: "spotifyControl",
      action: "next"
    };
  }

  if (/^(?:previous|back)(?: song| track)?(?: on spotify)?$/.test(normalized)) {
    return {
      type: "spotifyControl",
      action: "previous"
    };
  }

  return null;
}

function hasSpotifyContext(config) {
  const lastApp = normalizeText(state.sessionContext.lastAppName || "");
  const spotifyName = normalizeText(spotifyAppName(config));
  return (
    lastApp === spotifyName ||
    state.sessionContext.lastIntentType === "spotifyControl" ||
    Boolean(state.sessionContext.lastSpotifyAction)
  );
}

function parseContextualSpotifyIntent(rawText, config) {
  if (!hasSpotifyContext(config)) {
    return null;
  }

  const normalized = normalizeText(rawText);

  if (/^(?:play|resume)(?: it| music| the music| song)?(?: again)?$/.test(normalized)) {
    return {
      type: "spotifyControl",
      action: "play"
    };
  }

  if (/^(?:pause|stop)(?: it| the music| music)?$/.test(normalized)) {
    return {
      type: "spotifyControl",
      action: "pause"
    };
  }

  if (/^(?:next|skip)(?: one| it| song| track)?$/.test(normalized)) {
    return {
      type: "spotifyControl",
      action: "next"
    };
  }

  if (/^(?:previous|back)(?: one| it| song| track)?$/.test(normalized)) {
    return {
      type: "spotifyControl",
      action: "previous"
    };
  }

  if (/^(?:play|start|resume)(?: songs from)?(?: my)? liked songs(?: again)?$/.test(normalized)) {
    return {
      type: "spotifyControl",
      action: "likedSongs"
    };
  }

  return null;
}

function parseVolumeIntent(rawText) {
  const normalized = normalizeText(rawText);

  if (
    /^(?:volume up|turn volume up|increase volume|raise volume|increase the volume|raise the volume)$/.test(
      normalized
    )
  ) {
    return {
      type: "volumeControl",
      action: "adjust",
      delta: 10
    };
  }

  if (
    /^(?:volume down|turn volume down|decrease volume|lower volume|decrease the volume|lower the volume)$/.test(
      normalized
    )
  ) {
    return {
      type: "volumeControl",
      action: "adjust",
      delta: -10
    };
  }

  if (/^(?:max volume|full volume|volume max)$/.test(normalized)) {
    return {
      type: "volumeControl",
      action: "set",
      value: 100
    };
  }

  if (/^(?:mute|mute volume|mute the volume)$/.test(normalized)) {
    return {
      type: "volumeControl",
      action: "mute"
    };
  }

  if (/^(?:unmute|unmute volume|unmute the volume)$/.test(normalized)) {
    return {
      type: "volumeControl",
      action: "unmute"
    };
  }

  const setMatch = normalized.match(
    /^(?:set volume(?: to)?|set the volume(?: to)?|volume)\s+(\d{1,3})(?:\s*percent)?$/
  );
  if (setMatch) {
    const value = Math.max(0, Math.min(100, Number(setMatch[1])));
    return {
      type: "volumeControl",
      action: "set",
      value
    };
  }

  return null;
}

function findSettingsPanel(rawText) {
  const normalized = normalizeText(rawText);
  if (!normalized) {
    return null;
  }

  for (const [key, panel] of Object.entries(SETTINGS_PANELS)) {
    const aliases = panel.aliases.map(normalizeText);
    if (aliases.includes(normalized)) {
      return {
        key,
        ...panel
      };
    }
  }

  return null;
}

function parseSettingsIntent(rawText) {
  const normalized = normalizeText(rawText);
  const directPanel = findSettingsPanel(normalized);
  if (
    directPanel &&
    /^(?:open|show|go to|launch|start)\b/i.test(String(rawText || "").trim())
  ) {
    return {
      type: "settingsPanel",
      panelKey: directPanel.key
    };
  }

  const match = rawText.match(
    /^(?:open|show|go to|launch|start)\s+(.+?)(?:\s+settings)?$/i
  );
  if (!match) {
    return null;
  }

  const panel = findSettingsPanel(match[1]);
  if (!panel) {
    return null;
  }

  return {
    type: "settingsPanel",
    panelKey: panel.key
  };
}

function parseAppearanceIntent(rawText) {
  const normalized = normalizeText(rawText);

  if (
    /^(?:turn on|enable|switch to|use|set)(?: the)? dark mode$/.test(normalized) ||
    /^(?:turn on|enable|switch to|use|set)(?: the)? black theme$/.test(normalized) ||
    /^(?:make)(?: it| the system)? dark$/.test(normalized)
  ) {
    return {
      type: "appearanceMode",
      mode: "dark"
    };
  }

  if (
    /^(?:turn off|disable|switch to|use|set)(?: the)? dark mode$/.test(normalized) ||
    /^(?:turn on|enable|switch to|use|set)(?: the)? light mode$/.test(normalized) ||
    /^(?:make)(?: it| the system)? light$/.test(normalized)
  ) {
    return {
      type: "appearanceMode",
      mode: "light"
    };
  }

  if (
    /^(?:toggle|switch)(?: the)?(?: system)?(?: appearance| theme| dark mode)$/.test(
      normalized
    )
  ) {
    return {
      type: "appearanceMode",
      mode: "toggle"
    };
  }

  return null;
}

function parseWifiIntent(rawText) {
  const normalized = normalizeText(rawText);

  if (/^(?:turn on|enable)\s+(?:the\s+)?(?:wi fi|wifi)$/.test(normalized)) {
    return {
      type: "wifiControl",
      action: "on"
    };
  }

  if (/^(?:turn off|disable)\s+(?:the\s+)?(?:wi fi|wifi)$/.test(normalized)) {
    return {
      type: "wifiControl",
      action: "off"
    };
  }

  if (/^(?:toggle)\s+(?:the\s+)?(?:wi fi|wifi)$/.test(normalized)) {
    return {
      type: "wifiControl",
      action: "toggle"
    };
  }

  return null;
}

function parseBuiltInSystemIntent(rawText) {
  const normalized = normalizeText(rawText);

  if (
    /^(?:take|capture)?\s*(?:a\s+)?screenshot(?: now)?$/.test(normalized) ||
    /^(?:screen ?shot)$/.test(normalized)
  ) {
    return {
      type: "systemAction",
      action: "screenshot"
    };
  }

  if (
    /^(?:lock|lock my|lock the)\s+(?:screen|laptop|mac|computer)$/.test(normalized)
  ) {
    return {
      type: "systemAction",
      action: "lock"
    };
  }

  return null;
}

function parsePowerIntent(rawText) {
  const normalized = normalizeText(rawText);

  if (
    /^(?:sleep|put to sleep)(?: the)?(?: laptop| mac| computer| device| system)?$/.test(
      normalized
    )
  ) {
    return {
      type: "powerAction",
      action: "sleep"
    };
  }

  if (
    /^(?:restart|reboot)(?: the)?(?: laptop| mac| computer| device| system)?$/.test(
      normalized
    )
  ) {
    return {
      type: "powerAction",
      action: "restart"
    };
  }

  if (
    /^(?:shut down|shutdown|power off|turn off)(?: the)?(?: laptop| mac| computer| device| system)?$/.test(
      normalized
    )
  ) {
    return {
      type: "powerAction",
      action: "shutdown"
    };
  }

  if (
    /^(?:log out|logout|sign out)(?: me)?(?: from)?(?: this)?(?: mac| computer| laptop)?$/.test(
      normalized
    )
  ) {
    return {
      type: "powerAction",
      action: "logout"
    };
  }

  return null;
}

function settingsPanelSummary() {
  return Object.entries(SETTINGS_PANELS).map(([key, panel]) => ({
    key,
    label: panel.label,
    aliases: panel.aliases
  }));
}

function looksLikeUrl(text) {
  return /^(https?:\/\/|www\.)/i.test(text);
}

function expandHome(inputPath) {
  if (inputPath.startsWith("~/")) {
    return path.join(process.env.HOME || "", inputPath.slice(2));
  }
  return inputPath;
}

function parseOpenIntent(rawText, config) {
  const match = rawText.match(/^(?:open|launch|start)\s+(.+)$/i);
  if (!match) {
    return null;
  }
  const target = match[1].trim();
  const normalizedTarget = normalizeText(target);

  if (config.folders[normalizedTarget]) {
    return {
      type: "openPath",
      path: expandHome(config.folders[normalizedTarget]),
      label: titleCase(normalizedTarget)
    };
  }

  if (config.sites[normalizedTarget]) {
    return {
      type: "openUrl",
      url: config.sites[normalizedTarget],
      label: titleCase(normalizedTarget)
    };
  }

  if (looksLikeUrl(target)) {
    const url = /^https?:\/\//i.test(target) ? target : `https://${target}`;
    return {
      type: "openUrl",
      url,
      label: target
    };
  }

  const appName = config.apps[normalizedTarget] || target;
  return {
    type: "openApp",
    appName,
    label: titleCase(normalizedTarget)
  };
}

function parseSearchIntent(rawText) {
  const match = rawText.match(/^(?:search(?: google)? for)\s+(.+)$/i);
  if (!match) {
    return null;
  }
  return {
    type: "openUrl",
    url: `https://www.google.com/search?q=${encodeURIComponent(match[1].trim())}`,
    label: `Google search for ${match[1].trim()}`
  };
}

function resolveSiteKey(config, rawSite) {
  const normalized = normalizeText(rawSite);
  if (!normalized) {
    return "";
  }

  const directMatch = Object.keys(config.sites || {}).find(
    (key) => normalizeText(key) === normalized
  );
  if (directMatch) {
    return directMatch;
  }

  if (["youtube", "yt"].includes(normalized)) {
    return "youtube";
  }

  if (["github", "git hub"].includes(normalized)) {
    return "github";
  }

  if (["gmail", "google mail", "mail"].includes(normalized)) {
    return "gmail";
  }

  if (["chatgpt", "chat gpt"].includes(normalized)) {
    return "chatgpt";
  }

  if (["whatsapp", "whatsapp web", "whatsappweb"].includes(normalized)) {
    return "whatsappweb";
  }

  return "";
}

function siteSearchUrl(config, siteKey, query) {
  const resolvedKey = resolveSiteKey(config, siteKey);
  const cleanQuery = String(query || "").trim();
  if (!resolvedKey || !cleanQuery) {
    return "";
  }

  switch (resolvedKey) {
    case "youtube":
      return `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}`;
    case "github":
      return `https://github.com/search?q=${encodeURIComponent(cleanQuery)}`;
    case "gmail":
      return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(cleanQuery)}`;
    default: {
      const siteUrl = config.sites?.[resolvedKey] || "";
      const hostname = siteUrl ? new URL(siteUrl).hostname : resolvedKey;
      return `https://www.google.com/search?q=${encodeURIComponent(`site:${hostname} ${cleanQuery}`)}`;
    }
  }
}

function parseSiteSearchIntent(rawText, config) {
  const patterns = [
    /^(?:search|find|look for)\s+(.+?)\s+(?:on|in)\s+(.+)$/i,
    /^(?:search|find|look for)\s+(.+?)\s+for\s+(.+)$/i,
    /^(?:search on|find on)\s+(.+?)\s+for\s+(.+)$/i
  ];

  for (const pattern of patterns) {
    const match = rawText.match(pattern);
    if (!match) {
      continue;
    }

    const query = pattern === patterns[0] ? match[1] : match[2];
    const siteName = pattern === patterns[0] ? match[2] : match[1];
    const siteKey = resolveSiteKey(config, siteName);
    const url = siteSearchUrl(config, siteKey, query);
    if (!url) {
      continue;
    }

    return {
      type: "openUrl",
      url,
      label: `${titleCase(siteKey)} search for ${query.trim()}`
    };
  }

  return null;
}

function parseShortcutIntent(rawText) {
  const match = rawText.match(
    /^(?:(?:run|start|launch|open)\s+)?(?:shortcut|automation)\s+(.+)$/i
  );
  if (!match) {
    return null;
  }

  return {
    type: "shortcut",
    shortcutName: match[1].trim()
  };
}

function parseHelpIntent(rawText) {
  return /^(help|what can you do|show commands|list commands)$/.test(
    normalizeText(rawText)
  );
}

function parseGreetingIntent(rawText) {
  return /^(hi|hello|hey|good morning|good afternoon|good evening)$/i.test(
    normalizeText(rawText)
  );
}

function parseIdentityIntent(rawText) {
  return /^(who am i|what is my name|what s my name|tell me my name)$/i.test(
    normalizeText(rawText)
  );
}

function parseRenameIntent(rawText) {
  const match = String(rawText || "").trim().match(
    /^(?:call me|you can call me|refer to me as|my name is)\s+(.+)$/i
  );
  if (!match) {
    return null;
  }

  const preferredName = titleCase(
    match[1]
      .trim()
      .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
      .replace(/\s+/g, " ")
  );

  if (!preferredName) {
    return null;
  }

  return {
    type: "setUserName",
    preferredName
  };
}

function parseHistoryIntent(rawText) {
  return /^(history|show history|conversation history|show conversation)$/i.test(
    normalizeText(rawText)
  );
}

function parseClosePanelIntent(rawText) {
  return /^(close panel|hide panel|close commands|close history|hide commands|hide history)$/i.test(
    normalizeText(rawText)
  );
}

function parseQuitIntent(rawText, config) {
  const match = rawText.match(/^(?:close|quit|exit)\s+(.+)$/i);
  if (!match) {
    return null;
  }

  const target = match[1].trim();
  const normalizedTarget = normalizeText(target);
  if (["panel", "commands", "history", "drawer"].includes(normalizedTarget)) {
    return null;
  }

  if (["it", "that"].includes(normalizedTarget) && state.sessionContext.lastAppName) {
    return {
      type: "quitApp",
      appName: state.sessionContext.lastAppName
    };
  }

  return {
    type: "quitApp",
    appName: config.apps[normalizedTarget] || target
  };
}

function parseContextualReopenIntent(rawText) {
  const normalized = normalizeText(rawText);
  if (
    !/^(?:open|launch|start|reopen)\s+(?:it|that)(?:\s+again)?$/.test(normalized)
  ) {
    return null;
  }

  if (state.sessionContext.lastAppName) {
    return {
      type: "openApp",
      appName: state.sessionContext.lastAppName,
      label: state.sessionContext.lastAppName
    };
  }

  if (state.sessionContext.lastUrl) {
    return {
      type: "openUrl",
      url: state.sessionContext.lastUrl,
      label: state.sessionContext.lastUrl
    };
  }

  if (state.sessionContext.lastPath) {
    return {
      type: "openPath",
      path: state.sessionContext.lastPath,
      label: state.sessionContext.lastPath
    };
  }

  return null;
}

function looksLikeCompoundCommand(text) {
  return /(?:\b(?:and|then)\b).*(?:\b(open|search|message|send|run|launch|start|whatsapp)\b)/i.test(
    String(text || "")
  );
}

function looksLikeDeviceControlRequest(text) {
  const normalized = normalizeText(text);
  return /^(?:open|show|go to|launch|start|close|quit|exit|search|message|send|text|whatsapp|run|lock|take|capture|sleep|restart|reboot|shutdown|shut down|power off|turn on|turn off|enable|disable|toggle|set|switch|use|play|pause|resume|next|previous|skip|mute|unmute)\b/.test(
    normalized
  );
}

function summarizePlannerContext(config) {
  const contacts = Object.entries(config.contacts || {}).map(([key, contact]) => ({
    key,
    displayName: contact.displayName || titleCase(key),
    aliases: Array.isArray(contact.aliases) ? contact.aliases : []
  }));

  const apps = Object.entries(config.apps || {}).map(([key, appName]) => ({
    key,
    appName
  }));

  const sites = Object.entries(config.sites || {}).map(([key, url]) => ({
    key,
    url
  }));

  const folders = Object.entries(config.folders || {}).map(([key, folderPath]) => ({
    key,
    path: folderPath
  }));

  const customActions = (config.customActions || []).map((action) => ({
    phrase: action.phrase,
    description: action.description || action.phrase,
    requiresConfirmation: Boolean(action.requiresConfirmation)
  }));

  return {
    contacts,
    apps,
    sites,
    folders,
    settingsPanels: settingsPanelSummary(),
    customActions,
    messageDelivery: config.messageDelivery,
    capabilities: {
      volumeControl: true,
      quitApps: true,
      followUpContext: true,
      appearanceMode: true,
      wifiControl: true,
      powerActions: true,
      settingsPanels: true,
      systemActions: true,
      siteSearch: true,
      mixedTasks: true,
      arbitraryWhatsappContacts: true
    },
    spotify: {
      likedSongsUriConfigured: Boolean(config.spotify?.likedSongsUri)
    }
  };
}

function extractJsonObject(text) {
  const source = String(text || "").trim();
  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    return null;
  }

  const candidate = source.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(candidate);
  } catch (error) {
    return null;
  }
}

async function callGeminiPlanner(rawText, config) {
  const provider = activeKnowledgeProvider(config);
  if (provider === "openrouter") {
    return callOpenRouterPlanner(rawText, config);
  }

  const apiKey = geminiApiKey();
  if (!apiKey) {
    return null;
  }

  const model = config.knowledge?.model || DEFAULT_CONFIG.knowledge.model;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const plannerContext = summarizePlannerContext(config);
  const conversationHistory = conversationHistoryAsPrompt();
  const prompt = [
    `You are a planner for ${config.assistantName}, a desktop voice assistant.`,
    `Convert the user's request into safe structured actions when possible.`,
    `Return JSON only, with no markdown fences or extra text.`,
    `JSON schema:`,
    `{`,
    `  "mode": "action" | "knowledge" | "unsupported",`,
    `  "response": "short natural response",`,
    `  "needsConfirmation": true | false,`,
    `  "steps": [`,
    `    { "type": "open_app", "appName": "Google Chrome" },`,
    `    { "type": "open_site", "siteKey": "youtube" },`,
    `    { "type": "open_folder", "folderKey": "downloads" },`,
    `    { "type": "open_url", "url": "https://example.com" },`,
    `    { "type": "search_google", "query": "latest AI news" },`,
    `    { "type": "search_site", "siteKey": "youtube" | "github" | "gmail", "query": "lofi mix" },`,
    `    { "type": "knowledge_query", "query": "latest AI news" },`,
    `    { "type": "ui_panel", "panel": "commands" | "history" | "none" },`,
    `    { "type": "quit_app", "appName": "Spotify" },`,
    `    { "type": "volume_control", "action": "set" | "adjust" | "mute" | "unmute", "value": 40, "delta": 10 },`,
    `    { "type": "settings_panel", "panelKey": "sound" | "network" | "appearance" | "display" | "bluetooth" },`,
    `    { "type": "appearance_mode", "mode": "dark" | "light" | "toggle" },`,
    `    { "type": "wifi_control", "action": "on" | "off" | "toggle" },`,
    `    { "type": "power_action", "action": "sleep" | "restart" | "shutdown" | "logout" },`,
    `    { "type": "system_action", "action": "screenshot" | "lock" },`,
    `    { "type": "spotify_control", "action": "likedSongs" | "play" | "pause" | "next" | "previous" },`,
    `    { "type": "whatsapp", "contactKey": "dad", "message": "I will be late" },`,
    `    { "type": "whatsapp_name", "contactName": "Vinnu", "message": "I will be late" },`,
    `    { "type": "shortcut", "shortcutName": "Morning Routine" },`,
    `    { "type": "custom_action", "phrase": "lock the screen" }`,
    `  ]`,
    `}`,
    `Rules:`,
    `- Prefer mode "action" when the request can be fulfilled using the allowed step types, including mixed action plus information tasks.`,
    `- Use only contacts, apps, sites, folders, and custom action phrases from the provided context.`,
    `- Use quit_app for closing desktop apps and volume_control for speaker volume changes.`,
    `- Use settings_panel, appearance_mode, wifi_control, power_action, and system_action for built-in Mac system controls when they fit.`,
    `- Use spotify_control for Spotify playback requests.`,
    `- Use search_site for site-specific search requests like YouTube, GitHub, or Gmail.`,
    `- Use whatsapp_name for a contact name that is not in configured contact keys but may exist in Mac Contacts.`,
    `- Use knowledge_query when information lookup is one step inside a larger actionable task.`,
    `- Use ui_panel for requests to show commands, history, or close the panel.`,
    `- When mixing steps, place the step whose spoken result matters most at the end.`,
    `- Do not invent commands, shell, scripts, phone numbers, or contacts.`,
    `- Use mode "knowledge" for general questions, news, explanations, or information requests.`,
    `- Use mode "unsupported" for device-control requests that cannot be completed with the allowed step types.`,
    `- Mark needsConfirmation true for sending messages or potentially disruptive actions.`,
    conversationHistory ? `Recent conversation:\n${conversationHistory}` : "",
    `Available context: ${JSON.stringify(plannerContext)}`,
    `User request: ${rawText}`
  ].join("\n");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ]
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiMessage = extractProviderErrorMessage(
      payload,
      response.status,
      "gemini"
    );
    if (isQuotaExceededMessage(apiMessage, response.status)) {
      return {
        mode: "quota",
        response: quotaExceededReply("gemini").reply
      };
    }
    return null;
  }

  const reply = extractGeminiReply(payload);
  const plan = extractJsonObject(reply);
  if (!plan || !["action", "knowledge", "unsupported"].includes(plan.mode)) {
    return null;
  }
  return plan;
}

function openRouterHeaders(apiKey) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": `http://${HOST}:${PORT}`,
    "X-Title": "Jarvis Voice Assistant"
  };
}

function openRouterRequestBody(messages, config, extras = {}) {
  const body = {
    messages,
    ...extras
  };

  const model = configuredOpenRouterModel(config);
  if (model) {
    body.model = model;
  }

  return body;
}

function extractOpenRouterReply(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "string"
          ? part
          : typeof part?.text === "string"
            ? part.text
            : ""
      )
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  return String(content || "").trim();
}

async function callOpenRouterPlanner(rawText, config) {
  const apiKey = openRouterApiKey();
  if (!apiKey) {
    return null;
  }

  const plannerContext = summarizePlannerContext(config);
  const conversationHistory = conversationHistoryAsPrompt();
  const prompt = [
    `You are a planner for ${config.assistantName}, a desktop voice assistant.`,
    `Convert the user's request into safe structured actions when possible.`,
    `Return JSON only, with no markdown fences or extra text.`,
    `JSON schema:`,
    `{`,
    `  "mode": "action" | "knowledge" | "unsupported",`,
    `  "response": "short natural response",`,
    `  "needsConfirmation": true | false,`,
    `  "steps": [`,
    `    { "type": "open_app", "appName": "Google Chrome" },`,
    `    { "type": "open_site", "siteKey": "youtube" },`,
    `    { "type": "open_folder", "folderKey": "downloads" },`,
    `    { "type": "open_url", "url": "https://example.com" },`,
    `    { "type": "search_google", "query": "latest AI news" },`,
    `    { "type": "search_site", "siteKey": "youtube" | "github" | "gmail", "query": "lofi mix" },`,
    `    { "type": "knowledge_query", "query": "latest AI news" },`,
    `    { "type": "ui_panel", "panel": "commands" | "history" | "none" },`,
    `    { "type": "quit_app", "appName": "Spotify" },`,
    `    { "type": "volume_control", "action": "set" | "adjust" | "mute" | "unmute", "value": 40, "delta": 10 },`,
    `    { "type": "settings_panel", "panelKey": "sound" | "network" | "appearance" | "display" | "bluetooth" },`,
    `    { "type": "appearance_mode", "mode": "dark" | "light" | "toggle" },`,
    `    { "type": "wifi_control", "action": "on" | "off" | "toggle" },`,
    `    { "type": "power_action", "action": "sleep" | "restart" | "shutdown" | "logout" },`,
    `    { "type": "system_action", "action": "screenshot" | "lock" },`,
    `    { "type": "spotify_control", "action": "likedSongs" | "play" | "pause" | "next" | "previous" },`,
    `    { "type": "whatsapp", "contactKey": "dad", "message": "I will be late" },`,
    `    { "type": "whatsapp_name", "contactName": "Vinnu", "message": "I will be late" },`,
    `    { "type": "shortcut", "shortcutName": "Morning Routine" },`,
    `    { "type": "custom_action", "phrase": "lock the screen" }`,
    `  ]`,
    `}`,
    `Rules:`,
    `- Prefer mode "action" when the request can be fulfilled using the allowed step types, including mixed action plus information tasks.`,
    `- Use only contacts, apps, sites, folders, and custom action phrases from the provided context.`,
    `- Use quit_app for closing desktop apps and volume_control for speaker volume changes.`,
    `- Use settings_panel, appearance_mode, wifi_control, power_action, and system_action for built-in Mac system controls when they fit.`,
    `- Use spotify_control for Spotify playback requests.`,
    `- Use search_site for site-specific search requests like YouTube, GitHub, or Gmail.`,
    `- Use whatsapp_name for a contact name that is not in configured contact keys but may exist in Mac Contacts.`,
    `- Use knowledge_query when information lookup is one step inside a larger actionable task.`,
    `- Use ui_panel for requests to show commands, history, or close the panel.`,
    `- When mixing steps, place the step whose spoken result matters most at the end.`,
    `- Do not invent commands, shell, scripts, phone numbers, or contacts.`,
    `- Use mode "knowledge" for general questions, news, explanations, or information requests.`,
    `- Use mode "unsupported" for device-control requests that cannot be completed with the allowed step types.`,
    `- Mark needsConfirmation true for sending messages or potentially disruptive actions.`,
    conversationHistory ? `Recent conversation:\n${conversationHistory}` : "",
    `Available context: ${JSON.stringify(plannerContext)}`,
    `User request: ${rawText}`
  ].join("\n");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify(
      openRouterRequestBody(
        [{ role: "user", content: prompt }],
        config,
        {
          temperature: 0
        }
      )
    )
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiMessage = extractProviderErrorMessage(
      payload,
      response.status,
      "openrouter"
    );
    if (isQuotaExceededMessage(apiMessage, response.status)) {
      return {
        mode: "quota",
        response: quotaExceededReply("openrouter").reply
      };
    }
    return null;
  }

  const reply = extractOpenRouterReply(payload);
  const plan = extractJsonObject(reply);
  if (!plan || !["action", "knowledge", "unsupported"].includes(plan.mode)) {
    return null;
  }
  return plan;
}

function parseCustomIntent(rawText, config) {
  const normalized = normalizeText(rawText);
  for (const action of config.customActions || []) {
    const phrases = [action.phrase, ...(action.aliases || [])]
      .map(normalizeText)
      .filter(Boolean);
    if (phrases.includes(normalized)) {
      return {
        type: "customCommand",
        phrase: action.phrase,
        description: action.description || action.phrase,
        command: action.command,
        requiresConfirmation: Boolean(action.requiresConfirmation)
      };
    }
  }
  return null;
}

function handleIntent(rawText, config) {
  const cleanText = stripWakeWords(rawText, config.assistantName);
  const userProfile = readUserProfile();
  const currentName = currentUserDisplayName(userProfile);

  if (!cleanText.trim()) {
    return createReply(`I'm listening.`);
  }

  if (parseGreetingIntent(cleanText)) {
    return createReply(`Hi ${currentName}.`);
  }

  if (parseIdentityIntent(cleanText)) {
    return createReply(`You are ${currentName}.`);
  }

  const renameIntent = parseRenameIntent(cleanText);
  if (renameIntent) {
    return renameIntent;
  }

  if (parseHelpIntent(cleanText)) {
    return createReply(
      `Showing your command list. You can ask me to open apps, sites, folders, search Google, send WhatsApp messages, run macOS Shortcuts, or answer general questions.`,
      {
        uiPanel: "commands"
      }
    );
  }

  if (parseHistoryIntent(cleanText)) {
    return createReply(`Showing your recent conversation history.`, {
      uiPanel: "history"
    });
  }

  if (parseClosePanelIntent(cleanText)) {
    return createReply(`Closing the panel.`, {
      uiPanel: "none"
    });
  }

  const customIntent = parseCustomIntent(cleanText, config);
  if (customIntent) {
    if (customIntent.requiresConfirmation) {
      return rememberPending(
        customIntent,
        `I can ${customIntent.description}. Say yes to continue or no to cancel.`
      );
    }
    return customIntent;
  }

  const shortcutIntent = parseShortcutIntent(cleanText);
  if (shortcutIntent) {
    return shortcutIntent;
  }

  const settingsIntent = parseSettingsIntent(cleanText);
  if (settingsIntent) {
    return settingsIntent;
  }

  const appearanceIntent = parseAppearanceIntent(cleanText);
  if (appearanceIntent) {
    return appearanceIntent;
  }

  const wifiIntent = parseWifiIntent(cleanText);
  if (wifiIntent) {
    return wifiIntent;
  }

  const volumeIntent = parseVolumeIntent(cleanText);
  if (volumeIntent) {
    return volumeIntent;
  }

  const powerIntent = parsePowerIntent(cleanText);
  if (powerIntent) {
    return rememberPending(
      powerIntent,
      `I can ${powerIntent.action === "shutdown" ? "shut down" : powerIntent.action} your device. Say yes to continue or no to cancel.`
    );
  }

  const builtInSystemIntent = parseBuiltInSystemIntent(cleanText);
  if (builtInSystemIntent) {
    return builtInSystemIntent;
  }

  const quitIntent = parseQuitIntent(cleanText, config);
  if (quitIntent) {
    return quitIntent;
  }

  const spotifyIntent = parseSpotifyIntent(cleanText);
  if (spotifyIntent) {
    return spotifyIntent;
  }

  const contextualSpotifyIntent = parseContextualSpotifyIntent(cleanText, config);
  if (contextualSpotifyIntent) {
    return contextualSpotifyIntent;
  }

  const messageIntent = parseMessageIntent(cleanText, config);
  if (messageIntent) {
    const recipientLabel =
      messageIntent.contact
        ? contactLabel(messageIntent.contact)
        : messageIntent.spokenName || "that contact";
    return rememberPending(
      messageIntent,
      `Ready to ${config.messageDelivery === "autoSend" ? "send" : "draft"} a WhatsApp message to ${
        recipientLabel
      }: "${messageIntent.message}". Say yes to continue or no to cancel.`
    );
  }

  const followUpMessageIntent = parseFollowUpMessageIntent(cleanText);
  if (followUpMessageIntent) {
    return rememberPending(
      followUpMessageIntent,
      `Ready to ${config.messageDelivery === "autoSend" ? "send" : "draft"} another WhatsApp message to ${
        contactLabel(followUpMessageIntent.contact)
      }: "${followUpMessageIntent.message}". Say yes to continue or no to cancel.`
    );
  }

  if (looksLikeCompoundCommand(cleanText)) {
    return null;
  }

  const siteSearchIntent = parseSiteSearchIntent(cleanText, config);
  if (siteSearchIntent) {
    return siteSearchIntent;
  }

  const searchIntent = parseSearchIntent(cleanText);
  if (searchIntent) {
    return searchIntent;
  }

  const reopenIntent = parseContextualReopenIntent(cleanText);
  if (reopenIntent) {
    return reopenIntent;
  }

  const openIntent = parseOpenIntent(cleanText, config);
  if (openIntent) {
    return openIntent;
  }
  return null;
}

function runExec(command) {
  return new Promise((resolve, reject) => {
    exec(
      command,
      {
        shell: "/bin/zsh",
        timeout: 15_000
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        resolve({ stdout, stderr });
      }
    );
  });
}

function runExecFile(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 15_000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function runOsaScript(lines, language = "JavaScript") {
  const args = ["-l", language];
  for (const line of lines) {
    args.push("-e", line);
  }
  return runExecFile("osascript", args);
}

async function callGeminiKnowledge(query, config) {
  const provider = activeKnowledgeProvider(config);
  if (provider === "openrouter") {
    return callOpenRouterKnowledge(query, config);
  }

  const apiKey = geminiApiKey();
  if (!apiKey) {
    return createReply(
      `World knowledge is ready, but no Google AI key is configured yet. Add GEMINI_API_KEY to /Users/haindavlyada/Documents/jar/.env and restart the server.`
    );
  }

  const model = config.knowledge?.model || DEFAULT_CONFIG.knowledge.model;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const conversationHistory = conversationHistoryAsPrompt();
  const prompt = [
    `You are ${config.assistantName}, a voice-first desktop assistant.`,
    `Answer clearly and naturally for spoken output.`,
    `When Google Search grounding is available, use it for factual or recent information.`,
    `Prefer authoritative or reputable sources, and include concrete dates when the answer depends on current events.`,
    `If the user asks for a laptop action that is not currently configured, say that plainly instead of pretending it succeeded.`,
    conversationHistory ? `Recent conversation:\n${conversationHistory}` : "",
    `Current user request: ${query}`
  ]
    .filter(Boolean)
    .join("\n\n");

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ]
  };

  if (config.knowledge?.useGoogleSearch !== false) {
    requestBody.tools = [{ google_search: {} }];
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify(requestBody)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiMessage = extractProviderErrorMessage(
      payload,
      response.status,
      "gemini"
    );
    if (isQuotaExceededMessage(apiMessage, response.status)) {
      return quotaExceededReply("gemini");
    }
    return createReply(`I couldn't reach Google knowledge right now: ${apiMessage}`);
  }

  const reply = extractGeminiReply(payload);
  if (!reply) {
    return createReply(`Google knowledge returned an empty response. Please try again.`);
  }

  const sources = extractGroundingSources(payload);
  rememberKnowledgeTurn("user", query);
  rememberKnowledgeTurn("assistant", reply);

  return createReply(reply, {
    status: "completed",
    knowledge: true,
    grounded: sources.length > 0,
    sources
  });
}

async function callOpenRouterKnowledge(query, config) {
  const apiKey = openRouterApiKey();
  if (!apiKey) {
    return createReply(
      `World knowledge is ready, but no OpenRouter key is configured yet. Add OPENROUTER_API_KEY to /Users/haindavlyada/Documents/jar/.env and restart the server.`
    );
  }

  const conversationHistory = conversationHistoryAsPrompt();
  const prompt = [
    `You are ${config.assistantName}, a voice-first desktop assistant.`,
    `Answer clearly and naturally for spoken output.`,
    `Be honest when something may depend on current events or live web data.`,
    `If the user asks for a laptop action that is not currently configured, say that plainly instead of pretending it succeeded.`,
    conversationHistory ? `Recent conversation:\n${conversationHistory}` : "",
    `Current user request: ${query}`
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify(
      openRouterRequestBody(
        [{ role: "user", content: prompt }],
        config,
        {
          temperature: 0.2
        }
      )
    )
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiMessage = extractProviderErrorMessage(
      payload,
      response.status,
      "openrouter"
    );
    if (isQuotaExceededMessage(apiMessage, response.status)) {
      return quotaExceededReply("openrouter");
    }
    return createReply(`I couldn't reach OpenRouter right now: ${apiMessage}`);
  }

  const reply = extractOpenRouterReply(payload);
  if (!reply) {
    return createReply(`OpenRouter returned an empty response. Please try again.`);
  }

  rememberKnowledgeTurn("user", query);
  rememberKnowledgeTurn("assistant", reply);

  return createReply(reply, {
    status: "completed",
    knowledge: true,
    grounded: false,
    sources: []
  });
}

function plannerStepToIntent(step, config) {
  if (!step || typeof step !== "object") {
    return null;
  }

  switch (step.type) {
    case "open_app":
      if (!step.appName) {
        return null;
      }
      return {
        type: "openApp",
        appName: step.appName
      };
    case "open_site": {
      const siteKey = normalizeText(step.siteKey || "");
      const url = config.sites?.[siteKey];
      if (!url) {
        return null;
      }
      return {
        type: "openUrl",
        url,
        label: titleCase(siteKey)
      };
    }
    case "open_folder": {
      const folderKey = normalizeText(step.folderKey || "");
      const folderPath = config.folders?.[folderKey];
      if (!folderPath) {
        return null;
      }
      return {
        type: "openPath",
        path: expandHome(folderPath),
        label: titleCase(folderKey)
      };
    }
    case "open_url":
      if (!step.url) {
        return null;
      }
      return {
        type: "openUrl",
        url: step.url,
        label: step.url
      };
    case "search_google":
      if (!step.query) {
        return null;
      }
      return {
        type: "openUrl",
        url: `https://www.google.com/search?q=${encodeURIComponent(step.query)}`,
        label: `Google search for ${step.query}`
      };
    case "search_site": {
      if (!step.siteKey || !step.query) {
        return null;
      }
      const url = siteSearchUrl(config, step.siteKey, step.query);
      if (!url) {
        return null;
      }
      const siteKey = resolveSiteKey(config, step.siteKey) || step.siteKey;
      return {
        type: "openUrl",
        url,
        label: `${titleCase(siteKey)} search for ${step.query}`
      };
    }
    case "knowledge_query":
      if (!step.query) {
        return null;
      }
      return {
        type: "knowledge",
        query: step.query
      };
    case "ui_panel":
      if (!["commands", "history", "none"].includes(step.panel)) {
        return null;
      }
      return {
        type: "uiPanel",
        panel: step.panel
      };
    case "quit_app":
      if (!step.appName) {
        return null;
      }
      return {
        type: "quitApp",
        appName: step.appName
      };
    case "volume_control":
      if (!step.action) {
        return null;
      }
      return {
        type: "volumeControl",
        action: step.action,
        value: step.value,
        delta: step.delta
      };
    case "settings_panel":
      if (!step.panelKey) {
        return null;
      }
      return {
        type: "settingsPanel",
        panelKey: step.panelKey
      };
    case "appearance_mode":
      if (!step.mode) {
        return null;
      }
      return {
        type: "appearanceMode",
        mode: step.mode
      };
    case "wifi_control":
      if (!step.action) {
        return null;
      }
      return {
        type: "wifiControl",
        action: step.action
      };
    case "power_action":
      if (!step.action) {
        return null;
      }
      return {
        type: "powerAction",
        action: step.action
      };
    case "system_action":
      if (!step.action) {
        return null;
      }
      return {
        type: "systemAction",
        action: step.action
      };
    case "spotify_control":
      if (!step.action) {
        return null;
      }
      return {
        type: "spotifyControl",
        action: step.action
      };
    case "whatsapp": {
      const contact = config.contacts?.[step.contactKey];
      if (!contact || !step.message) {
        return null;
      }
      return {
        type: "whatsapp",
        contact: {
          key: step.contactKey,
          ...contact
        },
        message: step.message
      };
    }
    case "whatsapp_name":
      if (!step.contactName || !step.message) {
        return null;
      }
      return {
        type: "whatsappLookup",
        spokenName: step.contactName,
        message: step.message
      };
    case "shortcut":
      if (!step.shortcutName) {
        return null;
      }
      return {
        type: "shortcut",
        shortcutName: step.shortcutName
      };
    case "custom_action": {
      const phrase = normalizeText(step.phrase || "");
      const action = (config.customActions || []).find(
        (item) => normalizeText(item.phrase) === phrase
      );
      if (!action) {
        return null;
      }
      return {
        type: "customCommand",
        phrase: action.phrase,
        description: action.description || action.phrase,
        command: action.command,
        requiresConfirmation: Boolean(action.requiresConfirmation)
      };
    }
    default:
      return null;
  }
}

async function executePlannedSteps(steps, config) {
  if (!Array.isArray(steps) || !steps.length) {
    return createReply(`I couldn't find an executable action in that request.`);
  }

  const summaries = [];
  for (const step of steps) {
    const intent = plannerStepToIntent(step, config);
    if (!intent) {
      return createReply(
        `I understood the request, but one of the planned actions was not available in the current laptop controls.`
      );
    }
    const result = await executeIntent(intent, config);
    summaries.push(result.reply);
  }

  return createReply(summaries[summaries.length - 1], {
    status: "completed"
  });
}

function extractGeminiReply(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((part) => part?.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function extractGroundingSources(payload) {
  const chunks = payload?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const seen = new Set();
  const sources = [];

  for (const chunk of chunks) {
    const uri = chunk?.web?.uri;
    const title = chunk?.web?.title;
    if (!uri || seen.has(uri)) {
      continue;
    }
    seen.add(uri);
    sources.push({
      title: title || uri,
      url: uri
    });
    if (sources.length >= 5) {
      break;
    }
  }

  return sources;
}

async function lookupMacContact(spokenName) {
  if (process.platform !== "darwin") {
    return null;
  }

  const query = normalizeText(spokenName);
  if (!query) {
    return null;
  }

  const scriptLines = [
    "const Contacts = Application('Contacts');",
    "const query = " + JSON.stringify(query) + ";",
    "const normalize = (value) => String(value || '').toLowerCase().replace(/[^\\p{L}\\p{N}\\s]/gu, ' ').replace(/\\s+/g, ' ').trim();",
    "const people = Contacts.people();",
    "const matches = [];",
    "for (const person of people) {",
    "  const name = person.name();",
    "  const normalizedName = normalize(name);",
    "  if (!normalizedName) continue;",
    "  if (!(normalizedName === query || normalizedName.includes(query) || query.includes(normalizedName))) continue;",
    "  const phones = person.phones();",
    "  for (const phone of phones) {",
    "    matches.push({ name, phone: phone.value(), exact: normalizedName === query ? 1 : 0 });",
    "  }",
    "}",
    "matches.sort((left, right) => right.exact - left.exact || left.name.length - right.name.length);",
    "JSON.stringify(matches.slice(0, 5));"
  ];

  try {
    const result = await runOsaScript(scriptLines);
    const parsed = JSON.parse(result.stdout.trim() || "[]");
    const candidate = parsed.find((item) => /\d{8,}/.test(String(item.phone || "").replace(/[^\d]/g, "")));
    if (!candidate) {
      return null;
    }
    return {
      displayName: candidate.name,
      phone: candidate.phone,
      aliases: [spokenName]
    };
  } catch (error) {
    return {
      error:
        /Contacts|not authorized|not permitted|permission/i.test(error.message)
          ? "contacts_permission"
          : "lookup_failed"
    };
  }
}

async function resolveWhatsappContact(contact) {
  if (!contact) {
    return {
      error: "missing_contact"
    };
  }

  if (hasRealPhoneNumber(contact.phone)) {
    return {
      contact
    };
  }

  const candidates = Array.from(
    new Set(
      [contact.displayName, contact.key, ...(Array.isArray(contact.aliases) ? contact.aliases : [])]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );

  let permissionError = false;
  let lookupError = false;
  for (const candidate of candidates) {
    const foundContact = await lookupMacContact(candidate);
    if (!foundContact) {
      continue;
    }

    if (foundContact.error === "contacts_permission") {
      permissionError = true;
      continue;
    }

    if (foundContact.error) {
      lookupError = true;
      continue;
    }

    if (hasRealPhoneNumber(foundContact.phone)) {
      return {
        contact: {
          ...contact,
          displayName: foundContact.displayName || foundContact.name || contact.displayName,
          phone: foundContact.phone,
          aliases: Array.from(
            new Set([
              ...(Array.isArray(contact.aliases) ? contact.aliases : []),
              ...(Array.isArray(foundContact.aliases) ? foundContact.aliases : [])
            ])
          )
        }
      };
    }
  }

  if (permissionError) {
    return {
      error: "contacts_permission"
    };
  }

  if (lookupError) {
    return {
      error: "lookup_failed"
    };
  }

  return {
    error: "phone_missing"
  };
}

async function openItem(target, options = {}) {
  if (process.platform === "darwin") {
    if (options.appName) {
      if (String(options.appName).endsWith(".app") && fs.existsSync(options.appName)) {
        return runExecFile("open", [options.appName]);
      }
      return runExecFile("open", ["-a", options.appName]);
    }
    return runExecFile("open", [target]);
  }

  if (process.platform === "win32") {
    const startTarget = options.appName || target;
    return runExecFile("cmd", ["/c", "start", "", startTarget]);
  }

  return runExecFile("xdg-open", [target]);
}

async function ensureTtsCacheDir() {
  await fsp.mkdir(TTS_CACHE_DIR, { recursive: true });
}

async function loadKokoroModule() {
  if (!state.kokoroModulePromise) {
    state.kokoroModulePromise = import("kokoro-js").catch((error) => {
      state.kokoroModulePromise = null;
      throw error;
    });
  }

  return state.kokoroModulePromise;
}

async function getKokoroTts() {
  if (!kokoroServerTtsEnabled()) {
    state.kokoroStatus = "disabled";
    state.kokoroLastError = "Server-side Kokoro TTS is disabled on this host.";
    throw new Error(state.kokoroLastError);
  }

  if (!state.kokoroTtsPromise) {
    state.kokoroStatus = "loading";
    state.kokoroLastError = "";
    state.kokoroTtsPromise = (async () => {
      const { KokoroTTS } = await loadKokoroModule();
      const tts = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
        dtype: "q8",
        device: "cpu"
      });
      state.kokoroStatus = "ready";
      return tts;
    })().catch((error) => {
      state.kokoroLastError = error.message;
      state.kokoroStatus = "error";
      state.kokoroTtsPromise = null;
      throw error;
    });
  }

  return state.kokoroTtsPromise;
}

async function createKokoroSpeechAudio(text, voiceMode) {
  const mode = voiceMode === "male" ? "male" : "female";
  const voice = KOKORO_TTS_VOICES[mode];
  const safeText = String(text || "").trim().slice(0, 900);
  if (!safeText) {
    throw new Error("No text provided for speech.");
  }

  try {
    const tts = await getKokoroTts();
    const audio = await tts.generate(safeText, {
      voice: voice.id,
      speed: mode === "female" ? 1.0 : 0.98
    });

    state.kokoroStatus = "ready";
    state.kokoroLastError = "";

    return {
      buffer: Buffer.from(audio.toWav()),
      contentType: "audio/wav",
      voiceName: voice.label
    };
  } catch (error) {
    state.kokoroLastError = error.message;
    state.kokoroStatus = "error";
    state.kokoroTtsPromise = null;
    state.kokoroWarmupPromise = null;
    throw error;
  }
}

async function createNativeSpeechAudio(text, voiceMode) {
  if (process.platform !== "darwin") {
    throw new Error("Native macOS speech is not available on this platform.");
  }

  const mode = voiceMode === "male" ? "male" : "female";
  const voiceName = NATIVE_TTS_VOICES[mode][0];
  const safeText = String(text || "").trim().slice(0, 1200);
  if (!safeText) {
    throw new Error("No text provided for speech.");
  }

  await ensureTtsCacheDir();
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const aiffPath = path.join(TTS_CACHE_DIR, `${token}.aiff`);
  const m4aPath = path.join(TTS_CACHE_DIR, `${token}.m4a`);

  try {
    await runExecFile("/usr/bin/say", [
      "-v",
      voiceName,
      "-r",
      mode === "female" ? "182" : "176",
      "-o",
      aiffPath,
      safeText
    ]);
    await runExecFile("/usr/bin/afconvert", [
      "-f",
      "m4af",
      "-d",
      "aac",
      aiffPath,
      m4aPath
    ]);

    const buffer = await fsp.readFile(m4aPath);
    return {
      buffer,
      contentType: "audio/mp4",
      voiceName
    };
  } finally {
    await Promise.allSettled([fsp.rm(aiffPath, { force: true }), fsp.rm(m4aPath, { force: true })]);
  }
}

async function createSpeechAudio(text, voiceMode) {
  return createKokoroSpeechAudio(text, voiceMode);
}

function enqueueSpeechJob(job) {
  const nextJob = state.speechQueue
    .catch(() => {})
    .then(job);

  state.speechQueue = nextJob.catch(() => {});
  return nextJob;
}

async function warmKokoroVoices() {
  try {
    await createKokoroSpeechAudio("Ready.", "female");
    await createKokoroSpeechAudio("Ready.", "male");
  } catch (error) {
    state.kokoroLastError = error.message;
    state.kokoroStatus = "error";
  }
}

function kickoffKokoroWarmup() {
  if (!kokoroServerTtsEnabled()) {
    state.kokoroStatus = "disabled";
    state.kokoroLastError = "Server-side Kokoro TTS is disabled on this host.";
    return Promise.resolve(null);
  }

  if (!state.kokoroWarmupPromise) {
    state.kokoroWarmupPromise = getKokoroTts()
      .then(() => warmKokoroVoices())
      .catch(() => {})
      .finally(() => {
        if (state.kokoroStatus !== "ready") {
          state.kokoroWarmupPromise = null;
        }
      });
  }

  return state.kokoroWarmupPromise;
}

function whatsappUrl(phone, message) {
  const cleanedPhone = String(phone || "").replace(/[^\d]/g, "");
  return `whatsapp://send?phone=${cleanedPhone}&text=${encodeURIComponent(message)}`;
}

function whatsappFallbackUrl(phone, message) {
  const cleanedPhone = String(phone || "").replace(/[^\d]/g, "");
  return `https://wa.me/${cleanedPhone}?text=${encodeURIComponent(message)}`;
}

function spotifyAppName(config) {
  return config.apps?.spotify || DEFAULT_CONFIG.apps.spotify;
}

async function executeSettingsPanel(panelKey) {
  const panel = SETTINGS_PANELS[normalizeText(panelKey || "")];
  if (!panel) {
    return createReply(`I don't know that settings panel yet.`);
  }

  const attempts = Array.isArray(panel.targets) ? panel.targets : [];
  for (const target of attempts) {
    if (!target || !fs.existsSync(target)) {
      continue;
    }

    try {
      await openItem(target);
      rememberSessionContext({
        lastIntentType: "settingsPanel",
        lastPath: target
      });
      return createReply(`Opening ${panel.label}.`, {
        status: "completed"
      });
    } catch (error) {
      // Try the next available target.
    }
  }

  return createReply(
    `I found ${panel.label}, but macOS blocked me from opening that panel directly here.`
  );
}

async function executeAppearanceMode(mode) {
  if (process.platform !== "darwin") {
    return createReply(`Appearance mode changes are only wired for macOS right now.`);
  }

  const scriptLines =
    mode === "dark"
      ? [
          'tell application "System Events"',
          'tell appearance preferences',
          "set dark mode to true",
          "end tell",
          "end tell"
        ]
      : mode === "light"
        ? [
            'tell application "System Events"',
            'tell appearance preferences',
            "set dark mode to false",
            "end tell",
            "end tell"
          ]
        : [
            'tell application "System Events"',
            'tell appearance preferences',
            "set dark mode to not dark mode",
            "end tell",
            "end tell"
          ];

  try {
    await runOsaScript(scriptLines, "AppleScript");
    rememberSessionContext({
      lastIntentType: "appearanceMode"
    });
    return createReply(
      mode === "dark"
        ? `Dark mode is on.`
        : mode === "light"
          ? `Light mode is on.`
          : `Appearance mode toggled.`,
      { status: "completed" }
    );
  } catch (error) {
    return createReply(
      `I couldn't change the appearance mode automatically here. Open appearance settings and try again if macOS blocked automation.`
    );
  }
}

async function currentWifiPowerState(serviceName) {
  const result = await runExecFile("/usr/sbin/networksetup", [
    "-getairportpower",
    serviceName
  ]);
  return /:\s*on$/i.test(String(result.stdout || "").trim()) ? "on" : "off";
}

async function findWifiServiceName() {
  let authorizationBlocked = false;
  for (const serviceName of WIFI_SERVICE_CANDIDATES) {
    try {
      await currentWifiPowerState(serviceName);
      return {
        serviceName
      };
    } catch (error) {
      if (/authorization/i.test(String(error.message || ""))) {
        authorizationBlocked = true;
      }
    }
  }

  return authorizationBlocked
    ? { error: "authorization" }
    : { error: "unavailable" };
}

async function executeWifiControl(action) {
  if (process.platform !== "darwin") {
    return createReply(`Wi-Fi control is only wired for macOS right now.`);
  }

  const wifiService = await findWifiServiceName();
  if (wifiService.error === "authorization") {
    return createReply(
      `I need macOS permission to change Wi-Fi here. Open network settings if you want to change it manually.`
    );
  }

  if (wifiService.error || !wifiService.serviceName) {
    return createReply(`I couldn't find the Wi-Fi service on this Mac right now.`);
  }

  let nextState = action;
  if (action === "toggle") {
    const currentState = await currentWifiPowerState(wifiService.serviceName).catch(
      () => "off"
    );
    nextState = currentState === "on" ? "off" : "on";
  }

  try {
    await runExecFile("/usr/sbin/networksetup", [
      "-setairportpower",
      wifiService.serviceName,
      nextState
    ]);
    rememberSessionContext({
      lastIntentType: "wifiControl"
    });
    return createReply(
      nextState === "on" ? `Wi-Fi turned on.` : `Wi-Fi turned off.`,
      {
        status: "completed"
      }
    );
  } catch (error) {
    return createReply(
      `I couldn't change Wi-Fi automatically here. macOS may be blocking that command in this session.`
    );
  }
}

async function executeSystemAction(action) {
  if (action === "screenshot") {
    await runExec(
      "screencapture -i ~/Desktop/jarvis-$(date +%Y%m%d-%H%M%S).png"
    );
    rememberSessionContext({
      lastIntentType: "systemAction"
    });
    return createReply(`Screenshot ready.`, {
      status: "completed"
    });
  }

  if (action === "lock") {
    await runExec(
      "osascript -e 'tell application \"System Events\" to keystroke \"q\" using {control down, command down}'"
    );
    rememberSessionContext({
      lastIntentType: "systemAction"
    });
    return createReply(`Locking the screen.`, {
      status: "completed"
    });
  }

  return createReply(`I don't know that system action yet.`);
}

async function executePowerAction(action) {
  if (process.platform !== "darwin") {
    return createReply(`Power controls are only wired for macOS right now.`);
  }

  const appleScriptMap = {
    sleep: 'tell application "System Events" to sleep',
    restart: 'tell application "System Events" to restart',
    shutdown: 'tell application "System Events" to shut down',
    logout: 'tell application "System Events" to log out'
  };

  if (!appleScriptMap[action]) {
    return createReply(`I don't know that power action yet.`);
  }

  try {
    await runOsaScript([appleScriptMap[action]], "AppleScript");
    rememberSessionContext({
      lastIntentType: "powerAction"
    });
    return createReply(
      action === "sleep"
        ? `Putting the device to sleep.`
        : action === "restart"
          ? `Restarting the device.`
          : action === "shutdown"
            ? `Shutting down the device.`
            : `Logging out now.`,
      {
        status: "completed"
      }
    );
  } catch (error) {
    return createReply(
      `I couldn't ${action === "shutdown" ? "shut down" : action} the device automatically here. macOS may require more permission.`
    );
  }
}

async function executeVolumeControl(intent) {
  if (process.platform !== "darwin") {
    return createReply(`Speaker volume control is only wired for macOS right now.`);
  }

  const action = intent.action;
  if (action === "mute") {
    await runOsaScript(['set volume with output muted'], "AppleScript");
    rememberSessionContext({ lastIntentType: "volumeControl" });
    return createReply(`Muted the volume.`, {
      status: "completed"
    });
  }

  if (action === "unmute") {
    await runOsaScript(['set volume without output muted'], "AppleScript");
    rememberSessionContext({ lastIntentType: "volumeControl" });
    return createReply(`Unmuted the volume.`, {
      status: "completed"
    });
  }

  if (action === "set") {
    const value = Math.max(0, Math.min(100, Number(intent.value || 0)));
    await runOsaScript(
      ['set volume without output muted', `set volume output volume ${value}`],
      "AppleScript"
    );
    rememberSessionContext({ lastIntentType: "volumeControl" });
    return createReply(`Volume set to ${value} percent.`, {
      status: "completed"
    });
  }

  if (action === "adjust") {
    const delta = Math.max(-100, Math.min(100, Number(intent.delta || 0)));
    const result = await runOsaScript(
      [
        'set volume without output muted',
        'set currentVolume to output volume of (get volume settings)',
        `set targetVolume to currentVolume + (${delta})`,
        'if targetVolume > 100 then set targetVolume to 100',
        'if targetVolume < 0 then set targetVolume to 0',
        'set volume output volume targetVolume',
        'return targetVolume'
      ],
      "AppleScript"
    );
    const nextVolume = Number(String(result.stdout || "").trim());
    rememberSessionContext({ lastIntentType: "volumeControl" });
    return createReply(
      Number.isFinite(nextVolume)
        ? `Volume set to ${nextVolume} percent.`
        : `Adjusted the volume.`,
      {
        status: "completed"
      }
    );
  }

  return createReply(`I don't know that volume action yet.`);
}

async function executeQuitApp(appName) {
  if (process.platform !== "darwin") {
    return createReply(`Closing apps is only wired for macOS right now.`);
  }

  const escapedAppName = String(appName || "").replace(/"/g, '\\"');
  try {
    await runOsaScript([`tell application "${escapedAppName}" to quit`], "AppleScript");
    rememberSessionContext({
      lastIntentType: "quitApp",
      lastAppName: appName
    });
    return createReply(`Closing ${appName}.`, {
      status: "completed"
    });
  } catch (error) {
    return createReply(
      `I couldn't close ${appName}. Make sure the app is installed and open first.`
    );
  }
}

async function executeSpotifyControl(action, config) {
  const appName = spotifyAppName(config);

  if (process.platform !== "darwin") {
    await openItem(null, { appName });
    rememberSessionContext({
      lastIntentType: "spotifyControl",
      lastAppName: appName,
      lastSpotifyAction: action
    });
    return createReply(`Opening Spotify.`, {
      status: "completed"
    });
  }

  await openItem(null, { appName });
  rememberSessionContext({
    lastIntentType: "spotifyControl",
    lastAppName: appName,
    lastSpotifyAction: action
  });

  switch (action) {
    case "likedSongs": {
      const likedSongsUri =
        config.spotify?.likedSongsUri || DEFAULT_CONFIG.spotify.likedSongsUri;

      try {
        await openItem(likedSongsUri);
      } catch (error) {
        // Continue with the playback attempt even if the URI open fails.
      }

      try {
        await runOsaScript(
          [
            'tell application "Spotify" to activate',
            "delay 1.2",
            'tell application "Spotify" to play',
            "delay 0.3",
            'tell application "System Events" to key code 49'
          ],
          "AppleScript"
        );
      } catch (error) {
        return createReply(
          `Opening Spotify Liked Songs. If playback does not start automatically, set spotify.likedSongsUri in config/assistant.config.json.`
        );
      }

      return createReply(`Opening Spotify and starting your Liked Songs.`, {
        status: "completed"
      });
    }
    case "play":
      await runOsaScript(['tell application "Spotify" to play'], "AppleScript");
      return createReply(`Playing Spotify.`, {
        status: "completed"
      });
    case "pause":
      await runOsaScript(['tell application "Spotify" to pause'], "AppleScript");
      return createReply(`Pausing Spotify.`, {
        status: "completed"
      });
    case "next":
      await runOsaScript(['tell application "Spotify" to next track'], "AppleScript");
      return createReply(`Skipping to the next Spotify track.`, {
        status: "completed"
      });
    case "previous":
      await runOsaScript(
        ['tell application "Spotify" to previous track'],
        "AppleScript"
      );
      return createReply(`Going back to the previous Spotify track.`, {
        status: "completed"
      });
    default:
      return createReply(`I don't know that Spotify action yet.`);
  }
}

async function executeIntent(intent, config) {
  switch (intent.type) {
    case "openApp": {
      await openItem(null, { appName: intent.appName });
      rememberSessionContext({
        lastIntentType: "openApp",
        lastAppName: intent.appName
      });
      return createReply(`Opening ${intent.appName}.`, {
        status: "completed"
      });
    }
    case "openUrl": {
      await openItem(intent.url);
      rememberSessionContext({
        lastIntentType: "openUrl",
        lastUrl: intent.url,
        lastSearchQuery:
          /^https:\/\/www\.google\.com\/search\?q=/i.test(intent.url) && intent.label
            ? intent.label.replace(/^Google search for\s+/i, "")
            : state.sessionContext.lastSearchQuery
      });
      return createReply(`Opening ${intent.label}.`, {
        status: "completed"
      });
    }
    case "openPath": {
      await openItem(intent.path);
      rememberSessionContext({
        lastIntentType: "openPath",
        lastPath: intent.path
      });
      return createReply(`Opening ${intent.label}.`, {
        status: "completed"
      });
    }
    case "customCommand": {
      await runExec(intent.command);
      rememberSessionContext({
        lastIntentType: "customCommand"
      });
      return createReply(`Done. ${titleCase(intent.description)} completed.`, {
        status: "completed"
      });
    }
    case "plannedActions": {
      return executePlannedSteps(intent.steps, config);
    }
    case "settingsPanel": {
      return executeSettingsPanel(intent.panelKey);
    }
    case "appearanceMode": {
      return executeAppearanceMode(intent.mode);
    }
    case "wifiControl": {
      return executeWifiControl(intent.action);
    }
    case "powerAction": {
      return executePowerAction(intent.action);
    }
    case "systemAction": {
      return executeSystemAction(intent.action);
    }
    case "quitApp": {
      return executeQuitApp(intent.appName);
    }
    case "volumeControl": {
      return executeVolumeControl(intent);
    }
    case "spotifyControl": {
      return executeSpotifyControl(intent.action, config);
    }
    case "knowledge": {
      rememberSessionContext({
        lastIntentType: "knowledge"
      });
      return callGeminiKnowledge(intent.query, config);
    }
    case "setUserName": {
      const nextProfile = {
        ...readUserProfile(),
        preferredName: intent.preferredName
      };
      await writeUserProfile(nextProfile);
      rememberSessionContext({
        lastIntentType: "setUserName"
      });
      return createReply(`Okay. I will call you ${intent.preferredName}.`, {
        status: "completed"
      });
    }
    case "shortcut": {
      if (process.platform !== "darwin") {
        return createReply(
          `Shortcut execution is only wired for macOS right now.`
        );
      }
      try {
        await runExecFile("shortcuts", ["run", intent.shortcutName]);
        rememberSessionContext({
          lastIntentType: "shortcut",
          lastShortcutName: intent.shortcutName
        });
        return createReply(`Running shortcut ${intent.shortcutName}.`, {
          status: "completed"
        });
      } catch (error) {
        return createReply(
          `I couldn't run the shortcut "${intent.shortcutName}". Make sure it exists in the macOS Shortcuts app first.`
        );
      }
    }
    case "whatsapp": {
      const resolvedContact = await resolveWhatsappContact(intent.contact);
      if (resolvedContact.error === "contacts_permission") {
        return createReply(
          `I need macOS Contacts permission to automatically find ${contactLabel(intent.contact)}. Allow Contacts access, or save that contact with a phone number.`
        );
      }

      if (resolvedContact.error === "lookup_failed") {
        return createReply(
          `I couldn't look up ${contactLabel(intent.contact)} in Contacts right now. Try again, or save the number directly in config/assistant.config.json.`
        );
      }

      if (resolvedContact.error || !resolvedContact.contact) {
        return createReply(
          `I couldn't find a real phone number for ${contactLabel(intent.contact)} automatically. Save the contact in Contacts with a mobile number, or add the phone number in config/assistant.config.json.`
        );
      }

      const contact = resolvedContact.contact;
      rememberSessionContext({
        lastIntentType: "whatsapp",
        lastContact: cloneContactForContext(contact),
        lastWhatsappMessage: intent.message
      });

      const primaryUrl = whatsappUrl(contact.phone || "", intent.message);
      try {
        await openItem(primaryUrl);
      } catch (error) {
        await openItem(whatsappFallbackUrl(contact.phone || "", intent.message));
      }

      if (config.messageDelivery !== "autoSend") {
        return createReply(
          `WhatsApp is open with the message drafted for ${
            contact.displayName || titleCase(contact.key)
          }.`
        );
      }

      if (process.platform !== "darwin") {
        return createReply(
          `The message draft is ready. Auto-send is only scripted for macOS right now.`
        );
      }

      const script = [
        'tell application "WhatsApp" to activate',
        "delay 1.1",
        'tell application "System Events" to keystroke return'
      ]
        .map((line) => `-e '${line}'`)
        .join(" ");

      try {
        await runExec(`osascript ${script}`);
        return createReply(
          `Message sent to ${
            contact.displayName || titleCase(contact.key)
          }.`,
          { status: "completed" }
        );
      } catch (error) {
        return createReply(
          `I opened the WhatsApp draft, but auto-send needs macOS Accessibility and Automation permissions to work cleanly.`
        );
      }
    }
    case "whatsappLookup": {
      const foundContact = await lookupMacContact(intent.spokenName);
      if (!foundContact) {
        return createReply(
          `I couldn't find "${intent.spokenName}" in your configured contacts or Mac Contacts. Add the contact in Contacts or in config/assistant.config.json first.`
        );
      }

      if (foundContact.error === "contacts_permission") {
        return createReply(
          `I need macOS Contacts permission to find "${intent.spokenName}". Allow Contacts access for this app or add the contact in config/assistant.config.json.`
        );
      }

      if (foundContact.error) {
        return createReply(
          `I couldn't look up "${intent.spokenName}" in Mac Contacts right now. Add the contact in config/assistant.config.json if you want a guaranteed match.`
        );
      }

      return executeIntent(
        {
          type: "whatsapp",
          contact: foundContact,
          message: intent.message
        },
        config
      );
    }
    default:
      return createReply(`I don't know how to execute that request yet.`);
  }
}

async function processCommand(rawText) {
  clearExpiredPending();
  const config = readConfig();

  if (!state.pendingAction && (isAffirmative(rawText) || isNegative(rawText))) {
    return createReply(`There isn't a pending action right now. Ask me something or give me a command.`);
  }

  if (state.pendingAction) {
    if (isAffirmative(rawText)) {
      const pending = state.pendingAction;
      state.pendingAction = null;
      return executeIntent(pending, config);
    }
    if (isNegative(rawText)) {
      state.pendingAction = null;
      return createReply(`Cancelled.`, {
        status: "cancelled"
      });
    }
  }

  const intent = handleIntent(rawText, config);
  if (!intent) {
    const cleanText = stripWakeWords(rawText, config.assistantName);
    const planned = await callGeminiPlanner(cleanText, config);

    if (planned?.mode === "action" && Array.isArray(planned.steps) && planned.steps.length) {
      if (planned.needsConfirmation) {
        return rememberPending(
          {
            type: "plannedActions",
            steps: planned.steps,
            summary: planned.response || cleanText
          },
          planned.response ||
            `I can do that. Say yes to continue or no to cancel.`
        );
      }

      return executePlannedSteps(planned.steps, config);
    }

    if (planned?.mode === "quota") {
      return createReply(planned.response || quotaExceededReply().reply);
    }

    if (planned?.mode === "unsupported") {
      if (!looksLikeDeviceControlRequest(cleanText) && config.knowledge?.enabled !== false) {
        return callGeminiKnowledge(cleanText, config);
      }
      const plannerReply = String(planned.response || "").trim();
      return createReply(
        plannerReply && !/\b(contact|contacts|whatsapp|message)\b/i.test(plannerReply)
          ? `${plannerReply} Add that action as a custom action or macOS Shortcut and I can run it from voice.`
          : plannerReply ||
            `I understood the request, but that laptop action is not wired into my safe controls yet. Add it as a custom action or macOS Shortcut and I can run it.`
      );
    }

    if (config.knowledge?.enabled !== false) {
      return callGeminiKnowledge(cleanText, config);
    }

    return createReply(`I don't know that command yet. Say help for examples.`);
  }

  if (intent.reply) {
    return intent;
  }
  return executeIntent(intent, config);
}

function rememberCommandExchange(userText, assistantReply) {
  rememberConversationTurn("user", userText);
  rememberConversationTurn("assistant", assistantReply);
  rememberSessionContext({
    lastUserCommand: userText,
    lastAssistantReply: assistantReply
  });
}

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "GET" && requestUrl.pathname === "/api/config") {
      sendJson(response, 200, publicConfig(readConfig()));
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/command") {
      const body = await readBody(request);
      const payload = body ? JSON.parse(body) : {};
      const transcript = String(payload.transcript || "").trim();
      if (!transcript) {
        sendJson(response, 400, createReply("I need a command first."));
        return;
      }

      const result = await processCommand(transcript);
      rememberCommandExchange(transcript, result.reply);
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/interrupt") {
      state.pendingAction = null;
      sendJson(response, 200, createReply("Stopped.", {
        status: "cancelled"
      }));
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/tts") {
      const body = await readBody(request);
      const payload = body ? JSON.parse(body) : {};
      const text = String(payload.text || "").trim();
      const voiceMode = payload.voiceMode === "male" ? "male" : "female";

      if (!text) {
        sendJson(response, 400, { reply: "I need text to speak first." });
        return;
      }

      if (state.kokoroStatus !== "ready") {
        kickoffKokoroWarmup();
        const statusNote =
          state.kokoroStatus === "error" && state.kokoroLastError
            ? `Kokoro is unavailable right now: ${state.kokoroLastError}`
            : "Kokoro is still warming up on the server.";
        sendJson(response, 503, {
          reply: `${statusNote} Falling back to browser speech is recommended for now.`,
          status: state.kokoroStatus,
          fallbackProvider: "browser"
        });
        return;
      }

      try {
        const audio = await enqueueSpeechJob(() => createSpeechAudio(text, voiceMode));
        response.writeHead(200, {
          "Content-Type": audio.contentType,
          "Cache-Control": "no-store",
          "X-Jarvis-Voice": audio.voiceName
        });
        response.end(audio.buffer);
      } catch (error) {
        sendJson(response, 503, {
          reply: `Kokoro speech failed: ${error.message}`
        });
      }
      return;
    }

    if (request.method === "GET") {
      await serveStatic(response, requestUrl.pathname);
      return;
    }

    sendText(response, 405, "Method Not Allowed");
  } catch (error) {
    sendJson(response, 500, {
      reply: `Something went wrong: ${error.message}`
    });
  }
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  console.log(`Jarvis local assistant running at ${url}`);
});

kickoffKokoroWarmup();
