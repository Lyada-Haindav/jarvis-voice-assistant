const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const { exec, execFile } = require("child_process");

const ENV_PATH = path.join(__dirname, ".env");
loadDotEnv();

const APP_MODE = normalizeAppMode(process.env.JARVIS_MODE);
const LOCAL_AGENT_ENABLED = process.env.JARVIS_LOCAL_AGENT === "1";
const LOCAL_AGENT_HOST = process.env.JARVIS_AGENT_HOST || "127.0.0.1";
const LOCAL_AGENT_PORT = Number(process.env.JARVIS_AGENT_PORT || 3210);
const LOCAL_AGENT_BASE_URL =
  process.env.JARVIS_LOCAL_AGENT_URL || `http://${LOCAL_AGENT_HOST}:${LOCAL_AGENT_PORT}`;
const HOST =
  process.env.HOST ||
  (APP_MODE === "agent"
    ? LOCAL_AGENT_HOST
    : process.env.RENDER
      ? "0.0.0.0"
      : "127.0.0.1");
const PORT = Number(process.env.PORT || (APP_MODE === "agent" ? LOCAL_AGENT_PORT : 3000));
const PUBLIC_DIR = path.join(__dirname, "static");
const CONFIG_PATH = path.join(__dirname, "config", "assistant.config.json");
const USER_PROFILE_PATH = path.join(__dirname, "data", "user-profile.json");
const ASSISTANT_MEMORY_PATH = path.join(__dirname, "data", "assistant-memory.json");
const SCHEDULED_MESSAGES_PATH = path.join(__dirname, "data", "scheduled-messages.json");
const TTS_CACHE_DIR = path.join(os.tmpdir(), "jarvis-tts");
const ADDRESS_BOOK_DIR = path.join(os.homedir(), "Library", "Application Support", "AddressBook");
const CONFIRMATION_TTL_MS = 60_000;
const SCHEDULED_MESSAGE_POLL_MS = 15_000;
const MAX_KNOWLEDGE_TURNS = 8;
const MAX_CONVERSATION_TURNS = 20;
const PROMPT_CONVERSATION_TURNS = 6;
const PROMPT_KNOWLEDGE_TURNS = 4;
const PROMPT_TURN_CHAR_LIMIT = 220;
const OPENROUTER_FAST_MAX_TOKENS = 120;
const KOKORO_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const PREMIUM_TTS_MODEL =
  process.env.JARVIS_GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
const PREMIUM_ASR_MODEL =
  process.env.JARVIS_GEMINI_ASR_MODEL || "gemini-2.5-flash";
const PREMIUM_TTS_SAMPLE_RATE = 24000;
const PREMIUM_TTS_VOICES = {
  female: process.env.JARVIS_GEMINI_TTS_FEMALE_VOICE || "Aoede",
  male: process.env.JARVIS_GEMINI_TTS_MALE_VOICE || "Kore"
};
const ASR_MODEL_IDS = {
  english: process.env.JARVIS_ASR_ENGLISH_MODEL || "Xenova/whisper-tiny.en",
  multilingual: process.env.JARVIS_ASR_MULTILINGUAL_MODEL || "Xenova/whisper-tiny"
};
const ASR_SAMPLE_RATE = 16000;
const ASR_CHUNK_LENGTH_S = 3;
const ASR_STRIDE_LENGTH_S = 1;
const ASR_MAX_INPUT_SECONDS = 4.5;
const ASR_TARGET_PEAK = 0.82;
const ASR_TARGET_RMS = 0.16;
const ASR_MAX_GAIN = 6;
const ASR_MIN_TRIM_THRESHOLD = 0.01;
const ASR_MAX_TRIM_THRESHOLD = 0.045;
const ASR_TRIM_PADDING_MS = 180;
const PACKAGED_APP_UNPACKED_DIR = process.resourcesPath
  ? path.join(process.resourcesPath, "app.asar.unpacked")
  : "";
const PACKAGED_TRANSFORMERS_CACHE_DIR = PACKAGED_APP_UNPACKED_DIR
  ? path.join(
      PACKAGED_APP_UNPACKED_DIR,
      "node_modules",
      "@huggingface",
      "transformers",
      ".cache"
    )
  : "";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

function normalizeAppMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "cloud" || normalized === "agent") {
    return normalized;
  }
  if (!normalized && process.env.RENDER) {
    return "cloud";
  }
  return "desktop";
}

function isAgentMode() {
  return APP_MODE === "agent";
}

function isCloudMode() {
  return APP_MODE === "cloud";
}

const NATIVE_TTS_VOICES = {
  female: ["Flo (English (US))", "Samantha", "Karen", "Moira", "Tessa"],
  male: ["Eddy (English (US))", "Daniel"]
};

const NATIVE_MULTILINGUAL_TTS_VOICES = {
  hindi: {
    female: ["Lekha"],
    male: ["Lekha"]
  },
  telugu: {
    female: ["Geeta"],
    male: ["Geeta"]
  }
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

const DEVANAGARI_DIGITS = {
  "०": "0",
  "१": "1",
  "२": "2",
  "३": "3",
  "४": "4",
  "५": "5",
  "६": "6",
  "७": "7",
  "८": "8",
  "९": "9"
};

const TELUGU_DIGITS = {
  "౦": "0",
  "౧": "1",
  "౨": "2",
  "౩": "3",
  "౪": "4",
  "౫": "5",
  "౬": "6",
  "౭": "7",
  "౮": "8",
  "౯": "9"
};

const DEVANAGARI_PHONEMES = {
  vowels: {
    "अ": "a",
    "आ": "aː",
    "इ": "i",
    "ई": "iː",
    "उ": "u",
    "ऊ": "uː",
    "ऋ": "ɾɪ",
    "ॠ": "ɾiː",
    "ऌ": "ɭɪ",
    "ॡ": "ɭiː",
    "ए": "eː",
    "ऐ": "ai",
    "ओ": "oː",
    "औ": "au",
    "ऑ": "ɔː",
    "ॐ": "oː m"
  },
  matras: {
    "ा": "aː",
    "ि": "i",
    "ी": "iː",
    "ु": "u",
    "ू": "uː",
    "ृ": "ɾɪ",
    "ॄ": "ɾiː",
    "ॢ": "ɭɪ",
    "ॣ": "ɭiː",
    "े": "eː",
    "ै": "ai",
    "ो": "oː",
    "ौ": "au",
    "ॅ": "ɛ",
    "ॉ": "ɔː"
  },
  consonants: {
    "क": "k",
    "ख": "kʰ",
    "ग": "g",
    "घ": "gʱ",
    "ङ": "ŋ",
    "च": "tʃ",
    "छ": "tʃʰ",
    "ज": "dʒ",
    "झ": "dʒʱ",
    "ञ": "ɲ",
    "ट": "ʈ",
    "ठ": "ʈʰ",
    "ड": "ɖ",
    "ढ": "ɖʱ",
    "ण": "ɳ",
    "त": "t̪",
    "थ": "t̪ʰ",
    "द": "d̪",
    "ध": "d̪ʱ",
    "न": "n",
    "प": "p",
    "फ": "pʰ",
    "ब": "b",
    "भ": "bʱ",
    "म": "m",
    "य": "j",
    "र": "ɾ",
    "ल": "l",
    "व": "ʋ",
    "श": "ʃ",
    "ष": "ʂ",
    "स": "s",
    "ह": "h",
    "ळ": "ɭ",
    "क़": "q",
    "ख़": "x",
    "ग़": "ɣ",
    "ज़": "z",
    "ड़": "ɽ",
    "ढ़": "ɽʱ",
    "फ़": "f"
  },
  nuktaConsonants: {
    "क": "q",
    "ख": "x",
    "ग": "ɣ",
    "ज": "z",
    "ड": "ɽ",
    "ढ": "ɽʱ",
    "फ": "f"
  },
  nasalGroups: {
    velar: new Set(["क", "ख", "ग", "घ", "ङ", "क़", "ख़", "ग़"]),
    palatal: new Set(["च", "छ", "ज", "झ", "ञ", "ज़"]),
    retroflex: new Set(["ट", "ठ", "ड", "ढ", "ण", "ड़", "ढ़"]),
    dental: new Set(["त", "थ", "द", "ध", "न"]),
    labial: new Set(["प", "फ", "ब", "भ", "म", "फ़"])
  },
  digits: DEVANAGARI_DIGITS,
  virama: "्",
  nukta: "़",
  anusvara: new Set(["ं", "ँ"]),
  visarga: "ः",
  inherentVowel: "ə"
};

const TELUGU_PHONEMES = {
  vowels: {
    "అ": "a",
    "ఆ": "aː",
    "ఇ": "i",
    "ఈ": "iː",
    "ఉ": "u",
    "ఊ": "uː",
    "ఋ": "ɾɪ",
    "ౠ": "ɾiː",
    "ఎ": "e",
    "ఏ": "eː",
    "ఐ": "ai",
    "ఒ": "o",
    "ఓ": "oː",
    "ఔ": "au"
  },
  matras: {
    "ా": "aː",
    "ి": "i",
    "ీ": "iː",
    "ు": "u",
    "ూ": "uː",
    "ృ": "ɾɪ",
    "ౄ": "ɾiː",
    "ె": "e",
    "ే": "eː",
    "ై": "ai",
    "ొ": "o",
    "ో": "oː",
    "ౌ": "au"
  },
  consonants: {
    "క": "k",
    "ఖ": "kʰ",
    "గ": "g",
    "ఘ": "gʱ",
    "ఙ": "ŋ",
    "చ": "tʃ",
    "ఛ": "tʃʰ",
    "జ": "dʒ",
    "ఝ": "dʒʱ",
    "ఞ": "ɲ",
    "ట": "ʈ",
    "ఠ": "ʈʰ",
    "డ": "ɖ",
    "ఢ": "ɖʱ",
    "ణ": "ɳ",
    "త": "t̪",
    "థ": "t̪ʰ",
    "ద": "d̪",
    "ధ": "d̪ʱ",
    "న": "n",
    "ప": "p",
    "ఫ": "pʰ",
    "బ": "b",
    "భ": "bʱ",
    "మ": "m",
    "య": "j",
    "ర": "ɾ",
    "ల": "l",
    "వ": "ʋ",
    "శ": "ʃ",
    "ష": "ʂ",
    "స": "s",
    "హ": "h",
    "ళ": "ɭ",
    "ఱ": "ɽ"
  },
  nuktaConsonants: {},
  nasalGroups: {
    velar: new Set(["క", "ఖ", "గ", "ఘ", "ఙ"]),
    palatal: new Set(["చ", "ఛ", "జ", "ఝ", "ఞ"]),
    retroflex: new Set(["ట", "ఠ", "డ", "ఢ", "ణ", "ఱ", "ళ"]),
    dental: new Set(["త", "థ", "ద", "ధ", "న"]),
    labial: new Set(["ప", "ఫ", "బ", "భ", "మ"])
  },
  digits: TELUGU_DIGITS,
  virama: "్",
  nukta: "",
  anusvara: new Set(["ం"]),
  visarga: "ః",
  inherentVowel: "a"
};

const DEVANAGARI_SCRIPT_REGEX = /[\u0900-\u097F]/u;
const TELUGU_SCRIPT_REGEX = /[\u0C00-\u0C7F]/u;
const CONVERSATION_LANGUAGE_CODES = {
  auto: "auto",
  english: "en-IN",
  hindi: "hi-IN",
  telugu: "te-IN"
};
const LOCALIZED_RESPONSE_TEMPLATES = {
  cancelled: {
    english: "Cancelled.",
    hindi: "रद्द कर दिया।",
    telugu: "రద్దు చేశాను."
  },
  listening: {
    english: "I'm listening.",
    hindi: "मैं सुन रहा हूँ।",
    telugu: "నేను వింటున్నాను."
  },
  noPendingAction: {
    english: "There isn't a pending action right now. Ask me something or give me a command.",
    hindi: "अभी कोई pending action नहीं है। मुझसे कुछ पूछिए या कोई command दीजिए।",
    telugu: "ఇప్పుడు pending action ఏదీ లేదు. నన్ను ఏదైనా అడగండి లేదా ఒక command చెప్పండి."
  },
  tellMessageToSend: {
    english: ({ contact }) => `Tell me what message to send to ${contact}.`,
    hindi: ({ contact }) => `${contact} को क्या message भेजना है, वह बताइए।`,
    telugu: ({ contact }) => `${contact}కి ఏ message పంపాలో చెప్పండి.`
  },
  contactChoicePrompt: {
    english: ({ spokenName, items }) =>
      `I found multiple matches for "${spokenName}". ${items} Say the number you want, say the contact name, or say the last 4 digits.`,
    hindi: ({ spokenName, items }) =>
      `"${spokenName}" के लिए मुझे कई matches मिले। ${items} जो number चाहिए वह बोलिए, या contact का नाम बोलिए, या नंबर के आख़िरी 4 digits बोलिए।`,
    telugu: ({ spokenName, items }) =>
      `"${spokenName}" కోసం నాకు చాలా matches దొరికాయి. ${items} మీకు కావాల్సిన number చెప్పండి, లేదా contact పేరు చెప్పండి, లేదా last 4 digits చెప్పండి.`
  },
  contactChoiceItem: {
    english: ({ index, label, suffix }) =>
      `${index + 1}. ${label}${suffix ? ` ending ${suffix}` : ""}`,
    hindi: ({ index, label, suffix }) =>
      `${index + 1}. ${label}${suffix ? `, नंबर ${suffix} पर खत्म` : ""}`,
    telugu: ({ index, label, suffix }) =>
      `${index + 1}. ${label}${suffix ? `, ${suffix}తో ముగిసే నంబర్` : ""}`
  },
  readyWhatsapp: {
    english: ({ delivery, contact, message, suffix }) =>
      `Ready to ${delivery === "autoSend" ? "send" : "draft"} a WhatsApp message to ${contact}${
        suffix ? ` ending ${suffix}` : ""
      }: "${message}". Say yes to continue or no to cancel.`,
    hindi: ({ delivery, contact, message, suffix }) =>
      `${contact}${suffix ? `, नंबर ${suffix} पर खत्म` : ""} को WhatsApp message ${
        delivery === "autoSend" ? "भेजने" : "draft करने"
      } के लिए तैयार हूँ: "${message}". आगे बढ़ने के लिए हाँ कहिए या रद्द करने के लिए नहीं कहिए।`,
    telugu: ({ delivery, contact, message, suffix }) =>
      `${contact}${suffix ? `, ${suffix}తో ముగిసే నంబర్` : ""}కి WhatsApp message ${
        delivery === "autoSend" ? "పంపడానికి" : "draft చేయడానికి"
      } సిద్ధంగా ఉంది: "${message}". కొనసాగాలంటే అవును చెప్పండి, రద్దు చేయాలంటే కాదు చెప్పండి.`
  },
  whatsappDraftReady: {
    english: ({ contact }) => `WhatsApp is open with the message drafted for ${contact}.`,
    hindi: ({ contact }) => `${contact} के लिए WhatsApp draft तैयार है।`,
    telugu: ({ contact }) => `${contact} కోసం WhatsApp draft సిద్ధంగా ఉంది.`
  },
  whatsappSent: {
    english: ({ contact }) => `Message sent to ${contact}.`,
    hindi: ({ contact }) => `${contact} को message भेज दिया।`,
    telugu: ({ contact }) => `${contact}కి message పంపించాను.`
  },
  whatsappAutoSendPermission: {
    english:
      "I opened the WhatsApp draft, but auto-send needs macOS Accessibility and Automation permissions to work cleanly.",
    hindi:
      "मैंने WhatsApp draft खोल दिया, लेकिन auto-send के लिए macOS Accessibility और Automation permissions चाहिए।",
    telugu:
      "నేను WhatsApp draft తెరిచాను, కానీ auto-send సరిగ్గా పనిచేయడానికి macOS Accessibility మరియు Automation permissions కావాలి."
  },
  contactsPermissionResolve: {
    english: ({ contact }) =>
      `I need macOS Contacts permission to automatically find ${contact}. Allow Contacts access, or save that contact with a phone number.`,
    hindi: ({ contact }) =>
      `${contact} को अपने आप ढूंढने के लिए मुझे macOS Contacts permission चाहिए। Contacts access दें, या उस contact को phone number के साथ save करें।`,
    telugu: ({ contact }) =>
      `${contact}ని ఆటోమేటిక్‌గా కనుగొనడానికి నాకు macOS Contacts permission కావాలి. Contacts access ఇవ్వండి, లేదా ఆ contactని phone numberతో save చేయండి.`
  },
  contactsLookupResolveFailed: {
    english: ({ contact }) =>
      `I couldn't look up ${contact} in Contacts right now. Try again, or save the number directly in config/assistant.config.json.`,
    hindi: ({ contact }) =>
      `मैं अभी Contacts में ${contact} को नहीं देख पाया। फिर से कोशिश कीजिए, या number को सीधे config/assistant.config.json में save कीजिए।`,
    telugu: ({ contact }) =>
      `ఇప్పుడే Contactsలో ${contact}ను చూడలేకపోయాను. మళ్లీ ప్రయత్నించండి, లేదా numberని నేరుగా config/assistant.config.jsonలో save చేయండి.`
  },
  contactsPhoneMissing: {
    english: ({ contact }) =>
      `I couldn't find a real phone number for ${contact} automatically. Save the contact in Contacts with a mobile number, or add the phone number in config/assistant.config.json.`,
    hindi: ({ contact }) =>
      `मुझे ${contact} के लिए अपने आप सही phone number नहीं मिला। Contact को Contacts में mobile number के साथ save करें, या phone number को config/assistant.config.json में जोड़ें।`,
    telugu: ({ contact }) =>
      `${contact} కోసం నాకు ఆటోమేటిక్‌గా సరైన phone number దొరకలేదు. Contactని Contactsలో mobile numberతో save చేయండి, లేదా phone numberని config/assistant.config.jsonలో జోడించండి.`
  },
  contactsPermissionFind: {
    english: ({ spokenName }) =>
      `I need macOS Contacts permission to find "${spokenName}". Allow Contacts access for this app or add the contact in config/assistant.config.json.`,
    hindi: ({ spokenName }) =>
      `"${spokenName}" को ढूंढने के लिए मुझे macOS Contacts permission चाहिए। इस app को Contacts access दें, या contact को config/assistant.config.json में जोड़ें।`,
    telugu: ({ spokenName }) =>
      `"${spokenName}"ను కనుగొనడానికి నాకు macOS Contacts permission కావాలి. ఈ appకి Contacts access ఇవ్వండి, లేదా contactని config/assistant.config.jsonలో జోడించండి.`
  },
  contactsLookupFailed: {
    english: ({ spokenName }) =>
      `I couldn't look up "${spokenName}" in Mac Contacts right now. Add the contact in config/assistant.config.json if you want a guaranteed match.`,
    hindi: ({ spokenName }) =>
      `मैं अभी Mac Contacts में "${spokenName}" को नहीं देख पाया। Guaranteed match के लिए contact को config/assistant.config.json में जोड़ दीजिए।`,
    telugu: ({ spokenName }) =>
      `ఇప్పుడే Mac Contactsలో "${spokenName}"ను చూడలేకపోయాను. Guaranteed match కోసం contactని config/assistant.config.jsonలో జోడించండి.`
  },
  contactsNotFound: {
    english: ({ spokenName }) =>
      `I couldn't find "${spokenName}" in your configured contacts or Mac Contacts. Add the contact in Contacts or in config/assistant.config.json first.`,
    hindi: ({ spokenName }) =>
      `मुझे "${spokenName}" आपके configured contacts या Mac Contacts में नहीं मिला। पहले contact को Contacts में या config/assistant.config.json में जोड़ें।`,
    telugu: ({ spokenName }) =>
      `మీ configured contacts లేదా Mac Contactsలో "${spokenName}" నాకు కనిపించలేదు. ముందుగా contactని Contactsలో లేదా config/assistant.config.jsonలో జోడించండి.`
  },
  languageSet: {
    english: ({ label }) =>
      label === "Auto"
        ? "Okay. I will follow your language automatically."
        : `Okay. I will talk with you in ${label}.`,
    hindi: ({ label }) =>
      label === "Auto"
        ? "ठीक है। अब मैं आपकी भाषा अपने आप follow करूँगा।"
        : `ठीक है। अब मैं आपसे ${label} में बात करूँगा।`,
    telugu: ({ label }) =>
      label === "Auto"
        ? "సరే. ఇకమీదట మీరు ఏ భాషలో మాట్లాడితే దానిని నేనే follow అవుతాను."
        : `సరే. ఇకమీదట నేను మీతో ${label}లో మాట్లాడుతాను.`
  },
  readyScheduledWhatsapp: {
    english: ({ contact, message, when, suffix }) =>
      `Ready to schedule a WhatsApp message to ${contact}${suffix ? ` ending ${suffix}` : ""} for ${when}: "${message}". Say yes to save it or no to cancel.`,
    hindi: ({ contact, message, when, suffix }) =>
      `${contact}${suffix ? `, नंबर ${suffix} पर खत्म` : ""} को ${when} के लिए WhatsApp message schedule करने के लिए तैयार हूँ: "${message}". Save करने के लिए हाँ कहिए या cancel करने के लिए नहीं कहिए।`,
    telugu: ({ contact, message, when, suffix }) =>
      `${contact}${suffix ? `, ${suffix}తో ముగిసే నంబర్` : ""}కి ${when} కోసం WhatsApp message schedule చేయడానికి సిద్ధంగా ఉన్నాను: "${message}". Save చేయాలంటే అవును చెప్పండి, cancel చేయాలంటే కాదు చెప్పండి.`
  },
  scheduledWhatsappSaved: {
    english: ({ contact, when }) => `Scheduled a WhatsApp message to ${contact} for ${when}.`,
    hindi: ({ contact, when }) => `${contact}కు ${when} కోసం WhatsApp message schedule कर दिया।`,
    telugu: ({ contact, when }) => `${contact}కి ${when} కోసం WhatsApp message schedule చేశాను.`
  },
  scheduledMessagesEmpty: {
    english: "There are no pending scheduled messages right now.",
    hindi: "अभी कोई pending scheduled message नहीं है।",
    telugu: "ఇప్పుడే pending scheduled messages ఏవీ లేవు."
  }
};

const DEFAULT_CONFIG = {
  assistantName: "Jarvis",
  conversationLanguage: "english",
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
    whatsappweb: "https://web.whatsapp.com",
    spotify: "https://open.spotify.com"
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
    preferredLanguage: "auto",
    updatedAt: 0
  };
}

const state = {
  pendingAction: null,
  knowledgeHistory: [],
  conversationHistory: [],
  sessionContext: createSessionContext(),
  scheduledMessages: [],
  scheduledMessageTimer: null,
  scheduledMessageInFlight: new Set(),
  kokoroModulePromise: null,
  kokoroTtsPromise: null,
  kokoroWarmupPromise: null,
  kokoroStatus: "idle",
  kokoroLastError: "",
  premiumTtsStatus: "idle",
  premiumTtsLastError: "",
  premiumAsrStatus: "idle",
  premiumAsrLastError: "",
  speechQueue: Promise.resolve(),
  ttsCache: new Map(),
  assistantMemory: null,
  assistantMemoryPersistTimer: null,
  transcriptionQueue: Promise.resolve(),
  asrModulePromise: null,
  asrPipelinePromises: Object.create(null),
  asrStatus: "idle",
  asrLastError: ""
};

function kokoroServerTtsEnabled() {
  if (process.env.KOKORO_SERVER_TTS === "1") {
    return true;
  }

  if (process.env.KOKORO_SERVER_TTS === "0") {
    return false;
  }

  return true;
}

function premiumApiKey() {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    ""
  ).trim();
}

function premiumTtsEnabled() {
  if (process.env.JARVIS_PREMIUM_TTS === "0") {
    return false;
  }
  return Boolean(premiumApiKey());
}

function premiumAsrEnabled() {
  if (process.env.JARVIS_PREMIUM_ASR === "0") {
    return false;
  }
  return Boolean(premiumApiKey());
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

function setCorsHeaders(response, origin = "*") {
  response.setHeader("Access-Control-Allow-Origin", origin || "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Vary", "Origin");
}

const LOCAL_EXECUTION_INTENT_TYPES = new Set([
  "openApp",
  "openPath",
  "customCommand",
  "plannedActions",
  "settingsPanel",
  "appearanceMode",
  "wifiControl",
  "powerAction",
  "systemAction",
  "quitApp",
  "volumeControl",
  "spotifyControl",
  "shortcut",
  "whatsapp",
  "whatsappLookup"
]);

function isLocalExecutionIntent(intent) {
  return Boolean(intent && LOCAL_EXECUTION_INTENT_TYPES.has(intent.type));
}

function publicStatus() {
  const tts = publicTtsConfig();
  return {
    mode: APP_MODE,
    platform: process.platform,
    assistantName: readConfig().assistantName,
    localAgent: {
      enabled: LOCAL_AGENT_ENABLED && !isAgentMode(),
      baseUrl: LOCAL_AGENT_BASE_URL
    },
    tts: {
      provider: tts.provider,
      available: tts.available !== false
    },
    speechRecognition: publicSpeechRecognitionConfig()
  };
}

function createClientAction(type, payload = {}) {
  return {
    type,
    ...payload
  };
}

function withClientActions(result, clientActions) {
  const actions = Array.isArray(clientActions)
    ? clientActions.filter((action) => action && action.type)
    : [];
  if (!actions.length) {
    return result;
  }
  return {
    ...result,
    clientActions: actions
  };
}

function cloudUnsupportedReply(message, extras = {}) {
  return createReply(message, extras);
}

function webUrlForOpenApp(appName, config) {
  const normalized = normalizeText(appName);
  const sites = config.sites || {};
  const directSite = resolveSiteKey(config, normalized);
  if (directSite && sites[directSite]) {
    return {
      url: sites[directSite],
      label: titleCase(directSite)
    };
  }

  if (/\bwhatsapp\b/.test(normalized)) {
    return {
      url: sites.whatsappweb || "https://web.whatsapp.com",
      label: "WhatsApp Web"
    };
  }

  if (/\bspotify\b/.test(normalized)) {
    return {
      url: sites.spotify || "https://open.spotify.com",
      label: "Spotify Web"
    };
  }

  if (/\b(vscode|vs code|visual studio code)\b/.test(normalized)) {
    return {
      url: "https://vscode.dev",
      label: "VS Code for the Web"
    };
  }

  if (/\b(chrome|google chrome|safari|browser)\b/.test(normalized)) {
    return {
      url: "",
      label: "your browser"
    };
  }

  return null;
}

function openUrlClientReply(url, label, replyText = "") {
  return withClientActions(
    createReply(replyText || `Opening ${label}.`, {
      status: "completed"
    }),
    [createClientAction("open_url", { url, target: "_blank", fallbackTarget: "_self" })]
  );
}

function spotifyWebUrlForAction(action, config) {
  if (action === "likedSongs") {
    return "https://open.spotify.com/collection/tracks";
  }
  return config.sites?.spotify || "https://open.spotify.com";
}

function executeCloudIntent(intent, config) {
  switch (intent.type) {
    case "openUrl":
      return openUrlClientReply(intent.url, intent.label);
    case "openApp": {
      const fallback = webUrlForOpenApp(intent.appName, config);
      if (fallback?.url) {
        return openUrlClientReply(
          fallback.url,
          fallback.label,
          `Opening ${fallback.label} on this device.`
        );
      }
      if (fallback && !fallback.url) {
        return createReply(`You are already in ${fallback.label}.`, {
          status: "completed"
        });
      }
      return cloudUnsupportedReply(
        `I can open web apps from the hosted site, but ${intent.appName} does not have a browser-safe version here.`
      );
    }
    case "openPath":
      return cloudUnsupportedReply(
        `I can't open local folders from a hosted browser on every device.`
      );
    case "customCommand":
      return cloudUnsupportedReply(
        `Custom system commands need a local device app. They can't run from the hosted website alone.`
      );
    case "plannedActions":
      return executePlannedSteps(intent.steps, config);
    case "settingsPanel":
      return cloudUnsupportedReply(
        `System settings panels are not available from the hosted browser version.`
      );
    case "appearanceMode":
      return cloudUnsupportedReply(
        `Changing the device appearance mode is not available from the hosted browser version.`
      );
    case "wifiControl":
      return cloudUnsupportedReply(
        `Wi-Fi controls are not available from the hosted browser version.`
      );
    case "powerAction":
      return cloudUnsupportedReply(
        `Power controls are not available from the hosted browser version.`
      );
    case "systemAction":
      if (intent.action === "screenshot") {
        return cloudUnsupportedReply(
          `Use your device screenshot shortcut here. Browsers cannot trigger a real system screenshot on every device.`
        );
      }
      return cloudUnsupportedReply(
        `That system action is not available from the hosted browser version.`
      );
    case "quitApp":
      return cloudUnsupportedReply(
        `Closing native apps is not available from the hosted browser version.`
      );
    case "volumeControl":
      return cloudUnsupportedReply(
        `System volume control is not available from the hosted browser version.`
      );
    case "spotifyControl": {
      const spotifyUrl = spotifyWebUrlForAction(intent.action, config);
      const reply =
        intent.action === "likedSongs"
          ? "Opening Spotify Web with your Liked Songs."
          : "Opening Spotify Web on this device.";
      return openUrlClientReply(spotifyUrl, "Spotify Web", reply);
    }
    case "shortcut":
      return cloudUnsupportedReply(
        `Shortcuts need a local device app. They can't run from the hosted website alone.`
      );
    case "whatsapp": {
      const phone = normalizeWhatsappPhone(intent.contact?.phone || "");
      if (!phone) {
        return cloudUnsupportedReply(
          `I need a real phone number for ${contactLabel(intent.contact)} to open WhatsApp on this device.`
        );
      }
      return openUrlClientReply(
        whatsappFallbackUrl(phone, intent.message),
        "WhatsApp",
        `Opening a WhatsApp draft for ${contactLabel(intent.contact)} on this device.`
      );
    }
    case "whatsappLookup":
      return cloudUnsupportedReply(
        `In the hosted version, WhatsApp works with saved config contacts or direct phone numbers.`
      );
    default:
      return null;
  }
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

function readBinaryBody(request, maxLength = 5_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalLength = 0;

    request.on("data", (chunk) => {
      const nextChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalLength += nextChunk.length;
      if (totalLength > maxLength) {
        reject(new Error("Microphone recording is too large."));
        return;
      }
      chunks.push(nextChunk);
    });

    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

let phonemizerModule = null;

function isAsciiLetterOrDigit(char) {
  return /[A-Za-z0-9]/.test(char);
}

function isIgnorablePunctuation(char) {
  return /[.,!?;:"'(){}\[\]<>]/.test(char) || char === "।" || char === "॥";
}

function indicConfigForLanguage(language) {
  const normalized = normalizeConversationLanguage(language) || "english";
  if (normalized === "hindi") {
    return DEVANAGARI_PHONEMES;
  }
  if (normalized === "telugu") {
    return TELUGU_PHONEMES;
  }
  return null;
}

function nasalForNextChar(nextChar, config) {
  if (!nextChar) {
    return "n";
  }
  const groups = config?.nasalGroups;
  if (!groups) {
    return "n";
  }
  if (groups.velar?.has(nextChar)) {
    return "ŋ";
  }
  if (groups.palatal?.has(nextChar)) {
    return "ɲ";
  }
  if (groups.retroflex?.has(nextChar)) {
    return "ɳ";
  }
  if (groups.labial?.has(nextChar)) {
    return "m";
  }
  return "n";
}

async function phonemizeEnglishSegment(text) {
  const cleaned = String(text || "").trim();
  if (!cleaned) {
    return "";
  }
  try {
    if (!phonemizerModule) {
      phonemizerModule = require("phonemizer");
    }
    const parts = await phonemizerModule.phonemize(cleaned, "en-us");
    return parts.join(" ").replace(/\s+/g, " ").trim();
  } catch (error) {
    return "";
  }
}

async function phonemizeIndic(text, language) {
  const config = indicConfigForLanguage(language);
  if (!config) {
    return "";
  }

  const chars = Array.from(String(text || ""));
  const tokens = [];
  let latinBuffer = "";

  const flushLatin = async () => {
    if (!latinBuffer) {
      return;
    }
    const phonemes = await phonemizeEnglishSegment(latinBuffer);
    if (phonemes) {
      tokens.push(...phonemes.split(/\s+/g));
    }
    latinBuffer = "";
  };

  for (let index = 0; index < chars.length; index += 1) {
    const ch = chars[index];
    const digit = config.digits?.[ch];
    if (digit) {
      latinBuffer += digit;
      continue;
    }
    if (isAsciiLetterOrDigit(ch)) {
      latinBuffer += ch;
      continue;
    }

    if (latinBuffer) {
      await flushLatin();
    }

    if (!ch || /\s/.test(ch) || isIgnorablePunctuation(ch)) {
      continue;
    }

    if (config.vowels[ch]) {
      tokens.push(config.vowels[ch]);
      continue;
    }

    if (config.anusvara?.has(ch)) {
      tokens.push(nasalForNextChar(chars[index + 1], config));
      continue;
    }

    if (config.visarga && ch === config.visarga) {
      tokens.push("h");
      continue;
    }

    const consonant = config.consonants[ch];
    if (!consonant) {
      continue;
    }

    let resolvedConsonant = consonant;
    let nextChar = chars[index + 1];
    if (config.nukta && nextChar === config.nukta) {
      resolvedConsonant = config.nuktaConsonants?.[ch] || consonant;
      index += 1;
      nextChar = chars[index + 1];
    }

    if (config.virama && nextChar === config.virama) {
      tokens.push(resolvedConsonant);
      index += 1;
      continue;
    }

    if (config.matras?.[nextChar]) {
      tokens.push(resolvedConsonant);
      tokens.push(config.matras[nextChar]);
      index += 1;
      continue;
    }

    tokens.push(resolvedConsonant);
    if (config.inherentVowel) {
      tokens.push(config.inherentVowel);
    }
  }

  if (latinBuffer) {
    await flushLatin();
  }

  return tokens.join(" ").replace(/\s+/g, " ").trim();
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
    normalized === "default" ||
    normalized === "automatic" ||
    normalized === "auto language" ||
    normalized === "default language"
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
  return CONVERSATION_LANGUAGE_CODES[normalizeConversationLanguage(language) || "auto"];
}

function conversationLanguageLabel(language) {
  switch (normalizeConversationLanguage(language)) {
    case "english":
      return "English";
    case "hindi":
      return "Hindi";
    case "telugu":
      return "Telugu";
    default:
      return "Auto";
  }
}

function preferredConversationLanguage() {
  return normalizeConversationLanguage(state.sessionContext?.preferredLanguage) || "auto";
}

function effectiveConversationLanguage(text, overrideLanguage) {
  const preferred = normalizeConversationLanguage(overrideLanguage) || preferredConversationLanguage();
  if (preferred && preferred !== "auto") {
    return preferred;
  }
  return detectScriptLanguage(text) || "english";
}

function localizedResponse(key, params = {}, language = preferredConversationLanguage()) {
  const entry = LOCALIZED_RESPONSE_TEMPLATES[key];
  if (!entry) {
    return "";
  }

  const resolvedLanguage = effectiveConversationLanguage("", language);
  const template = entry[resolvedLanguage] || entry.english;
  return typeof template === "function" ? template(params) : template;
}

function readyWhatsappPrompt(contact, message, delivery, language) {
  return localizedResponse(
    "readyWhatsapp",
    {
      contact: contactLabel(contact),
      suffix: contactPhoneSuffix(contact?.phone),
      delivery,
      message
    },
    language
  );
}

function readyScheduledWhatsappPrompt(contact, message, sendAt, language) {
  return localizedResponse(
    "readyScheduledWhatsapp",
    {
      contact: contactLabel(contact),
      suffix: contactPhoneSuffix(contact?.phone),
      message,
      when: formatScheduledDateTime(sendAt, language)
    },
    language
  );
}

function localeForLanguage(language) {
  const normalized = normalizeConversationLanguage(language) || "english";
  if (normalized === "hindi") {
    return "hi-IN";
  }
  if (normalized === "telugu") {
    return "te-IN";
  }
  return "en-IN";
}

function formatScheduledDateTime(value, language = preferredConversationLanguage()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(localeForLanguage(language), {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function parseClockTime(hourText, minuteText, meridiem) {
  let hour = Number(hourText);
  const minute = Number(minuteText || 0);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute < 0 || minute > 59) {
    return null;
  }

  const normalizedMeridiem = String(meridiem || "").trim().toLowerCase();
  if (normalizedMeridiem === "am") {
    if (hour === 12) {
      hour = 0;
    }
  } else if (normalizedMeridiem === "pm") {
    if (hour < 12) {
      hour += 12;
    }
  }

  if (hour < 0 || hour > 23) {
    return null;
  }

  return {
    hour,
    minute
  };
}

function parseScheduledDateTimeExpression(expression) {
  const raw = String(expression || "").trim();
  if (!raw) {
    return null;
  }

  const now = new Date();
  const relativePatterns = [
    { pattern: /^in\s+(\d+)\s*(minutes?|mins?)$/i, unit: "minutes" },
    { pattern: /^in\s+(\d+)\s*(hours?|hrs?)$/i, unit: "hours" },
    { pattern: /^(\d+)\s*(मिनट)\s+(?:में|बाद)$/u, unit: "minutes" },
    { pattern: /^(\d+)\s*(घंटा|घंटे)\s+(?:में|बाद)$/u, unit: "hours" },
    { pattern: /^(\d+)\s*(నిమిషం|నిమిషాలు)\s*(?:లో|తర్వాత)$/u, unit: "minutes" },
    { pattern: /^(\d+)\s*(గంట|గంటలు)\s*(?:లో|తర్వాత)$/u, unit: "hours" }
  ];

  for (const { pattern, unit } of relativePatterns) {
    const match = raw.match(pattern);
    if (!match) {
      continue;
    }

    const value = Number(match[1]);
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }

    const date = new Date(now);
    if (unit === "hours") {
      date.setHours(date.getHours() + value);
    } else {
      date.setMinutes(date.getMinutes() + value);
    }
    return date;
  }

  const absolutePatterns = [
    { pattern: /^today\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i, dayOffset: 0 },
    { pattern: /^tomorrow\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i, dayOffset: 1 },
    { pattern: /^कल\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|बजे)?$/u, dayOffset: 1 },
    { pattern: /^రేపు\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/u, dayOffset: 1 }
  ];

  for (const { pattern, dayOffset } of absolutePatterns) {
    const match = raw.match(pattern);
    if (!match) {
      continue;
    }

    const time = parseClockTime(match[1], match[2], match[3]);
    if (!time) {
      return null;
    }

    const date = new Date(now);
    date.setDate(date.getDate() + dayOffset);
    date.setHours(time.hour, time.minute, 0, 0);
    if (date.getTime() <= now.getTime()) {
      date.setDate(date.getDate() + 1);
    }
    return date;
  }

  let match = raw.match(/^at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (match) {
    const time = parseClockTime(match[1], match[2], match[3]);
    if (!time) {
      return null;
    }
    const date = new Date(now);
    date.setHours(time.hour, time.minute, 0, 0);
    if (date.getTime() <= now.getTime()) {
      date.setDate(date.getDate() + 1);
    }
    return date;
  }

  match = raw.match(/^at\s+(\d{1,2}):(\d{2})$/i);
  if (match) {
    const time = parseClockTime(match[1], match[2], "");
    if (!time) {
      return null;
    }
    const date = new Date(now);
    date.setHours(time.hour, time.minute, 0, 0);
    if (date.getTime() <= now.getTime()) {
      date.setDate(date.getDate() + 1);
    }
    return date;
  }

  match = raw.match(/^on\s+(\d{4})-(\d{2})-(\d{2})\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (match) {
    const time = parseClockTime(match[4], match[5], match[6]);
    if (!time) {
      return null;
    }
    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      time.hour,
      time.minute,
      0,
      0
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function extractScheduledCommand(rawText) {
  const text = String(rawText || "").trim();
  if (!text) {
    return null;
  }

  const suffixPatterns = [
    /\s+(in\s+\d+\s*(?:minutes?|mins?|hours?|hrs?))$/i,
    /\s+(today\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)$/i,
    /\s+(tomorrow\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)$/i,
    /\s+(at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm))$/i,
    /\s+(at\s+\d{1,2}:\d{2})$/i,
    /\s+(on\s+\d{4}-\d{2}-\d{2}\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)$/i,
    /\s+((?:\d+)\s*(?:मिनट|घंटा|घंटे)\s+(?:में|बाद))$/u,
    /\s+((?:\d+)\s*(?:నిమిషం|నిమిషాలు|గంట|గంటలు)\s*(?:లో|తర్వాత))$/u,
    /\s+((?:कल)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|बजे)?)$/u,
    /\s+((?:రేపు)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)$/u
  ];

  for (const pattern of suffixPatterns) {
    const match = text.match(pattern);
    if (!match || typeof match.index !== "number") {
      continue;
    }

    const scheduledAt = parseScheduledDateTimeExpression(match[1]);
    if (!scheduledAt) {
      continue;
    }

    return {
      sendAt: scheduledAt,
      commandText: text.slice(0, match.index).trim(),
      timeText: match[1].trim()
    };
  }

  return null;
}

function createScheduledMessageId() {
  return `scheduled_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeScheduledMessageRecord(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const sendAt = new Date(entry.sendAt);
  if (Number.isNaN(sendAt.getTime())) {
    return null;
  }

  return {
    id: String(entry.id || createScheduledMessageId()),
    contact: cloneContactForContext(entry.contact),
    message: String(entry.message || "").trim(),
    sendAt: sendAt.toISOString(),
    status: String(entry.status || "pending"),
    createdAt: String(entry.createdAt || new Date().toISOString()),
    sentAt: entry.sentAt ? String(entry.sentAt) : "",
    error: entry.error ? String(entry.error) : "",
    conversationLanguage: normalizeConversationLanguage(entry.conversationLanguage) || "auto"
  };
}

async function loadScheduledMessages() {
  try {
    const text = await fsp.readFile(SCHEDULED_MESSAGES_PATH, "utf8");
    const parsed = JSON.parse(text);
    state.scheduledMessages = Array.isArray(parsed)
      ? parsed.map(normalizeScheduledMessageRecord).filter(Boolean)
      : [];
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`Jarvis could not read scheduled messages: ${error.message}`);
    }
    state.scheduledMessages = [];
  }
}

async function persistScheduledMessages() {
  await fsp.mkdir(path.dirname(SCHEDULED_MESSAGES_PATH), { recursive: true });
  await fsp.writeFile(
    SCHEDULED_MESSAGES_PATH,
    JSON.stringify(state.scheduledMessages, null, 2) + "\n",
    "utf8"
  );
}

async function saveScheduledWhatsapp(contact, message, sendAt, conversationLanguage) {
  const record = normalizeScheduledMessageRecord({
    id: createScheduledMessageId(),
    contact,
    message,
    sendAt: sendAt instanceof Date ? sendAt.toISOString() : sendAt,
    status: "pending",
    createdAt: new Date().toISOString(),
    conversationLanguage
  });

  state.scheduledMessages.push(record);
  state.scheduledMessages.sort((left, right) => new Date(left.sendAt) - new Date(right.sendAt));
  await persistScheduledMessages();
  return record;
}

function pendingScheduledMessages(limit = 10) {
  return state.scheduledMessages
    .filter((entry) => entry.status === "pending")
    .sort((left, right) => new Date(left.sendAt) - new Date(right.sendAt))
    .slice(0, limit);
}

function scheduledMessagesSummary(language = preferredConversationLanguage()) {
  const pending = pendingScheduledMessages(5);
  if (!pending.length) {
    return localizedResponse("scheduledMessagesEmpty", {}, language);
  }

  const items = pending
    .map((entry, index) => {
      const when = formatScheduledDateTime(entry.sendAt, language);
      return `${index + 1}. ${contactLabel(entry.contact)} at ${when}: "${entry.message}"`;
    })
    .join(" ");
  return `Here are your pending scheduled messages. ${items}`;
}

function describeScheduledMessage(entry, index, language = preferredConversationLanguage()) {
  const when = formatScheduledDateTime(entry.sendAt, language);
  return `${index + 1}. ${contactLabel(entry.contact)} at ${when}: "${entry.message}"`;
}

function resolveScheduledMessageSelection(selectorText) {
  const pending = pendingScheduledMessages(50);
  if (!pending.length) {
    return null;
  }

  const raw = String(selectorText || "").trim();
  if (!raw) {
    return pending.length === 1 ? pending[0] : null;
  }

  const listIndex = parseListSelection(raw, pending.length);
  if (listIndex !== null) {
    return pending[listIndex] || null;
  }

  const normalized = normalizeText(raw);
  if (!normalized) {
    return pending.length === 1 ? pending[0] : null;
  }

  if (["latest", "last", "newest"].includes(normalized)) {
    return pending[pending.length - 1] || null;
  }

  if (["next", "first", "upcoming"].includes(normalized)) {
    return pending[0] || null;
  }

  const bySuffix = pending.filter((entry) => {
    const suffix = contactPhoneSuffix(entry.contact?.phone || "");
    return suffix && normalized.includes(suffix);
  });
  if (bySuffix.length === 1) {
    return bySuffix[0];
  }

  const byContact = pending.filter((entry) => {
    const aliases = [
      entry.contact?.displayName || "",
      entry.contact?.key || "",
      ...(Array.isArray(entry.contact?.aliases) ? entry.contact.aliases : [])
    ]
      .map(normalizeText)
      .filter(Boolean);
    return aliases.some(
      (alias) =>
        alias === normalized || alias.includes(normalized) || normalized.includes(alias)
    );
  });
  if (byContact.length === 1) {
    return byContact[0];
  }

  const byMessage = pending.filter((entry) =>
    normalizeText(entry.message || "").includes(normalized)
  );
  if (byMessage.length === 1) {
    return byMessage[0];
  }

  return pending.length === 1 ? pending[0] : null;
}

async function cancelScheduledMessage(record) {
  const target = state.scheduledMessages.find((entry) => entry.id === record?.id);
  if (!target) {
    return null;
  }

  target.status = "cancelled";
  target.error = "";
  target.cancelledAt = new Date().toISOString();
  await persistScheduledMessages();
  return target;
}

async function updateScheduledMessage(record, updates = {}) {
  const target = state.scheduledMessages.find((entry) => entry.id === record?.id);
  if (!target) {
    return null;
  }

  if (updates.sendAt) {
    target.sendAt = updates.sendAt instanceof Date ? updates.sendAt.toISOString() : String(updates.sendAt);
  }
  if (typeof updates.message === "string" && updates.message.trim()) {
    target.message = cleanWhatsappMessage(updates.message);
  }
  if (updates.contact) {
    target.contact = cloneContactForContext(updates.contact);
  }
  target.status = "pending";
  target.error = "";
  state.scheduledMessages.sort((left, right) => new Date(left.sendAt) - new Date(right.sendAt));
  await persistScheduledMessages();
  return target;
}

async function processDueScheduledMessages() {
  if (!state.scheduledMessages.length) {
    return;
  }

  const dueEntries = state.scheduledMessages.filter((entry) => {
    if (entry.status !== "pending") {
      return false;
    }
    if (state.scheduledMessageInFlight.has(entry.id)) {
      return false;
    }
    return new Date(entry.sendAt).getTime() <= Date.now();
  });

  for (const entry of dueEntries) {
    state.scheduledMessageInFlight.add(entry.id);
    try {
      const result = await executeIntent(
        {
          type: "whatsapp",
          contact: entry.contact,
          message: entry.message
        },
        readConfig()
      );
      if (result?.status === "failed") {
        entry.status = "failed";
        entry.error = String(result.reply || "Delivery failed.");
      } else {
        entry.status = "sent";
        entry.sentAt = new Date().toISOString();
        entry.error = "";
      }
    } catch (error) {
      entry.status = "failed";
      entry.error = String(error?.message || error || "Delivery failed.");
    } finally {
      state.scheduledMessageInFlight.delete(entry.id);
      await persistScheduledMessages().catch(() => {});
    }
  }
}

async function startScheduledMessageRunner() {
  await loadScheduledMessages();
  if (state.scheduledMessageTimer) {
    return;
  }

  await processDueScheduledMessages().catch(() => {});
  state.scheduledMessageTimer = setInterval(() => {
    processDueScheduledMessages().catch(() => {});
  }, SCHEDULED_MESSAGE_POLL_MS);
}

function stopScheduledMessageRunner() {
  if (!state.scheduledMessageTimer) {
    return;
  }
  clearInterval(state.scheduledMessageTimer);
  state.scheduledMessageTimer = null;
}

function applyTurnConversationLanguage(result, rawText) {
  if (!result || typeof result !== "object") {
    return result;
  }

  if (
    !result.conversationLanguage ||
    result.conversationLanguage === "auto"
  ) {
    result.conversationLanguage =
      detectScriptLanguage(result.reply || "") ||
      effectiveConversationLanguage(rawText);
  }

  return result;
}

function stripWakeWords(text, assistantName) {
  const normalizedName = normalizeText(assistantName || "jarvis");
  let cleaned = String(text || "").trim();
  const patterns = [
    new RegExp(`^hey\\s+${normalizedName}[,\\s:.-]*`, "i"),
    new RegExp(`^hi\\s+${normalizedName}[,\\s:.-]*`, "i"),
    new RegExp(`^hello\\s+${normalizedName}[,\\s:.-]*`, "i"),
    new RegExp(`^namaste\\s+${normalizedName}[,\\s:.-]*`, "i"),
    new RegExp(`^${normalizedName}[,\\s:.-]*`, "i"),
    /^(?:हे|हाय|హेलो|नमस्ते)\s+जार्विस[\s,:.-]*/u,
    /^जार्विस[\s,:.-]*/u,
    /^(?:హే|హాయ్|నమస్తే)\s+జార్విస్[\s,:.-]*/u,
    /^జార్విస్[\s,:.-]*/u,
    /^please\s+/i,
    /^can you\s+/i,
    /^could you\s+/i
  ];
  for (const pattern of patterns) {
    cleaned = cleaned.replace(pattern, "").trim();
  }
  return cleaned || text;
}

function parseAssistantAddress(text, assistantName) {
  const normalizedName = normalizeText(assistantName || "jarvis");
  const raw = String(text || "").trim();
  const patterns = [
    new RegExp(`^(?:hey|hi|hello|namaste)\\s+${normalizedName}\\b[\\s,:.!-]*(.*)$`, "i"),
    new RegExp(`^${normalizedName}\\b[\\s,:.!-]*(.*)$`, "i"),
    /^(?:हे|हाय|हेलो|नमस्ते)\s+जार्विस\b[\s,:.!-]*(.*)$/u,
    /^जार्विस\b[\s,:.!-]*(.*)$/u,
    /^(?:హే|హాయ్|నమస్తే)\s+జార్విస్\b[\s,:.!-]*(.*)$/u,
    /^జార్విస్\b[\s,:.!-]*(.*)$/u
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match) {
      return {
        addressed: true,
        command: String(match[1] || "").trim()
      };
    }
  }

  return {
    addressed: false,
    command: raw
  };
}

function isAffirmative(text) {
  return [
    "yes",
    "yeah",
    "yep",
    "confirm",
    "do it",
    "send it",
    "go ahead",
    "proceed",
    "sure",
    "haan",
    "han",
    "haan ji",
    "haan ji",
    "जी हाँ",
    "हाँ",
    "हां",
    "हाँ जी",
    "अवును",
    "ఔను",
    "సరే"
  ].includes(normalizeText(text));
}

function isNegative(text) {
  return [
    "no",
    "nope",
    "cancel",
    "stop",
    "never mind",
    "dont",
    "don't",
    "नहीं",
    "नहि",
    "मत",
    "रुको",
    "कాదు",
    "వద్దు",
    "ఆపు"
  ].includes(normalizeText(text));
}

const LIST_SELECTION_WORDS = {
  first: 1,
  one: 1,
  second: 2,
  two: 2,
  third: 3,
  three: 3,
  fourth: 4,
  four: 4,
  fifth: 5,
  five: 5,
  पहला: 1,
  पहली: 1,
  एक: 1,
  दूसरा: 2,
  दूसरी: 2,
  दो: 2,
  तीसरा: 3,
  तीसरी: 3,
  तीन: 3,
  चौथा: 4,
  चौथी: 4,
  चार: 4,
  पाँचवाँ: 5,
  पाँचवीं: 5,
  पांचवा: 5,
  पाँच: 5,
  మొదటి: 1,
  ఒకటి: 1,
  రెండో: 2,
  రెండవ: 2,
  రెండు: 2,
  మూడో: 3,
  మూడవ: 3,
  మూడు: 3,
  నాల్గో: 4,
  నాల్గవ: 4,
  నాలుగు: 4,
  ఐదో: 5,
  ఐదవ: 5,
  ఐదు: 5
};

function parseListSelection(text, max) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return null;
  }

  const numericMatch = normalized.match(
    /^(?:option|choice|pick|select|choose|number|विकल्प|ఎంపిక)?\s*(\d+)$/u
  );
  if (numericMatch) {
    const index = Number(numericMatch[1]);
    if (index >= 1 && index <= max) {
      return index - 1;
    }
  }

  const ordinalMatch = normalized.match(
    /^(?:(?:pick|select|choose|विकल्प चुनो|ఎంపిక ఎంచుకో)\s+)?(?:the\s+)?(first|one|second|two|third|three|fourth|four|fifth|five|पहला|पहली|एक|दूसरा|दूसरी|दो|तीसरा|तीसरी|तीन|चौथा|चौथी|चार|पाँचवाँ|पाँचवीं|पांचवा|पाँच|మొదటి|ఒకటి|రెండో|రెండవ|రెండు|మూడో|మూడవ|మూడు|నాల్గో|నాల్గవ|నాలుగు|ఐదో|ఐదవ|ఐదు)(?:\s+one)?$/u
  );
  if (ordinalMatch) {
    const index = LIST_SELECTION_WORDS[ordinalMatch[1]];
    return index >= 1 && index <= max ? index - 1 : null;
  }

  const embeddedNumber = normalized.match(/\b(\d+)\b/u);
  if (embeddedNumber) {
    const index = Number(embeddedNumber[1]);
    if (index >= 1 && index <= max) {
      return index - 1;
    }
  }

  const embeddedOrdinal = normalized.match(
    /\b(first|one|second|two|third|three|fourth|four|fifth|five|पहला|पहली|एक|दूसरा|दूसरी|दो|तीसरा|तीसरी|तीन|चौथा|चौथी|चार|पाँचवाँ|पाँचवीं|पांचवा|पाँच|మొదటి|ఒకటి|రెండో|రెండవ|రెండు|మూడో|మూడవ|మూడు|నాల్గో|నాల్గవ|నాలుగు|ఐదో|ఐదవ|ఐదు)\b/u
  );
  if (embeddedOrdinal) {
    const index = LIST_SELECTION_WORDS[embeddedOrdinal[1]];
    return index >= 1 && index <= max ? index - 1 : null;
  }

  return null;
}

function contactPhoneSuffix(phone) {
  const digits = String(phone || "").replace(/[^\d]/g, "");
  return digits.length >= 4 ? digits.slice(-4) : "";
}

function collapseRepeatedName(text) {
  const words = String(text || "").split(" ").filter(Boolean);
  if (words.length >= 2 && words.length % 2 === 0) {
    const half = words.length / 2;
    const left = words.slice(0, half).join(" ");
    const right = words.slice(half).join(" ");
    if (left === right) {
      return left;
    }
  }
  return words.join(" ");
}

function describeContactChoice(contact, index, language = preferredConversationLanguage()) {
  const label = contactLabel(contact);
  const suffix = contactPhoneSuffix(contact.phone);
  return localizedResponse(
    "contactChoiceItem",
    {
      index,
      label,
      suffix
    },
    language
  );
}

function whatsappChoicePrompt(spokenName, matches) {
  const language = effectiveConversationLanguage(spokenName);
  const items = matches
    .map((contact, index) => describeContactChoice(contact, index, language))
    .join(" ");
  return localizedResponse("contactChoicePrompt", {
    spokenName,
    items
  }, language);
}

function matchContactBySuffix(rawText, matches) {
  const digitMatches = String(rawText || "").match(/\d{4,}/g);
  if (!digitMatches || !digitMatches.length) {
    return null;
  }
  const suffixes = digitMatches.map((digits) => digits.slice(-4));
  const candidates = matches.filter((contact) => {
    const suffix = contactPhoneSuffix(contact.phone);
    return suffix && suffixes.includes(suffix);
  });
  return candidates.length === 1 ? candidates[0] : null;
}

function matchLastContactChoice(matches) {
  const lastContact = state.sessionContext?.lastContact || recentContactMemory();
  if (!lastContact) {
    return null;
  }
  const lastPhone = normalizeWhatsappPhone(lastContact.phone || "");
  const lastKey = normalizeText(lastContact.key || lastContact.displayName || "");
  return (
    matches.find((contact) => {
      const contactPhone = normalizeWhatsappPhone(contact.phone || "");
      if (lastPhone && contactPhone && lastPhone === contactPhone) {
        return true;
      }
      const contactKey = normalizeText(contact.key || contact.displayName || "");
      return lastKey && contactKey && lastKey === contactKey;
    }) || null
  );
}

function looksLikePronounSelection(rawText) {
  const normalized = normalizeText(rawText);
  if (!normalized) {
    return false;
  }
  if (/\b(him|her|them)\b/.test(normalized)) {
    return true;
  }
  if (/\b(this|that)\b/.test(normalized) && /\b(one|contact|person|guy|girl|gal)\b/.test(normalized)) {
    return true;
  }
  return false;
}

function resolveContactChoiceFromReply(rawText, matches) {
  const numericIndex = parseListSelection(rawText, matches.length);
  if (numericIndex !== null) {
    return matches[numericIndex];
  }

  const suffixMatch = matchContactBySuffix(rawText, matches);
  if (suffixMatch) {
    return suffixMatch;
  }

  const normalized = normalizeText(rawText);
  if (!normalized) {
    return null;
  }

  const namedMatch =
    matches.find((contact) => {
      const aliases = [
        contact.displayName || "",
        contact.key || "",
        ...(Array.isArray(contact.aliases) ? contact.aliases : [])
      ]
        .map(normalizeText)
        .filter(Boolean);

      return aliases.some(
        (alias) =>
          alias === normalized ||
          alias.includes(normalized) ||
          normalized.includes(alias)
      );
    }) || null;

  if (namedMatch) {
    return namedMatch;
  }

  if (looksLikePronounSelection(rawText)) {
    const lastContactMatch = matchLastContactChoice(matches);
    if (lastContactMatch) {
      return lastContactMatch;
    }
    return matches[0] || null;
  }

  return null;
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
    deployment: {
      mode: APP_MODE,
      hosted: isCloudMode()
    },
    localAgent: {
      enabled: LOCAL_AGENT_ENABLED && !isAgentMode(),
      baseUrl: LOCAL_AGENT_BASE_URL
    },
    conversationLanguage: preferredConversationLanguage(),
    recognitionLanguage: conversationLanguageCode(preferredConversationLanguage()),
    user: {
      displayName: currentUserDisplayName(profile)
    },
    tts: publicTtsConfig(),
    speechRecognition: publicSpeechRecognitionConfig(),
    messageDelivery: config.messageDelivery,
    knowledge: {
      enabled: Boolean(config.knowledge?.enabled),
      provider,
      model: activeKnowledgeModel(config),
      status: knowledgeStatus(config)
    },
    memory: {
      recentCommands: (state.assistantMemory?.recentCommands || [])
        .slice(0, 4)
        .map((entry) => entry.text),
      recentApps: (state.assistantMemory?.recentApps || [])
        .slice(0, 4)
        .map((entry) => entry.name),
      recentContacts: (state.assistantMemory?.recentContacts || [])
        .slice(0, 4)
        .map((entry) => entry.displayName || titleCase(entry.key || ""))
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
      `schedule a WhatsApp to dad saying I will be late tomorrow at 6 pm`,
      `show scheduled messages`,
      `cancel scheduled message 1`,
      `reschedule scheduled message 1 to tomorrow at 7 pm`,
      `talk to me in Hindi`,
      `తెలుగులో మాట్లాడు`,
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
    conversationLanguage:
      extras.conversationLanguage || preferredConversationLanguage(),
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

  const awaitingSelection = action?.type === "whatsappContactChoice";
  const language =
    action?.conversationLanguage ||
    effectiveConversationLanguage(
      [prompt, action?.message, action?.spokenName, contactLabel(action?.contact)].filter(Boolean).join(" ")
    );
  return createReply(prompt, {
    awaitingConfirmation: !awaitingSelection,
    awaitingSelection,
    conversationLanguage: language,
    status: awaitingSelection ? "needs_selection" : "needs_confirmation"
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
  return {
    provider: "browser",
    femaleVoice: "",
    maleVoice: ""
  };
}

function nativeVoiceNameForLanguage(language, voiceMode) {
  if (process.platform !== "darwin") {
    return "";
  }

  const mode = voiceMode === "male" ? "male" : "female";
  const normalizedLanguage = normalizeConversationLanguage(language) || "english";
  if (normalizedLanguage === "hindi" || normalizedLanguage === "telugu") {
    return NATIVE_MULTILINGUAL_TTS_VOICES[normalizedLanguage]?.[mode]?.[0] || "";
  }

  return NATIVE_TTS_VOICES[mode]?.[0] || "";
}

function ttsProviderCandidatesForLanguage(language) {
  const normalizedLanguage = normalizeConversationLanguage(language) || "english";
  const providers = [];

  if (normalizedLanguage === "hindi" || normalizedLanguage === "telugu") {
    if (kokoroServerTtsEnabled()) {
      providers.push("kokoro_server");
    }
    if (!providers.length && premiumTtsEnabled()) {
      providers.push("gemini_tts");
    }
    return providers;
  }

  if (kokoroServerTtsEnabled()) {
    providers.push("kokoro_server");
  }
  if (premiumTtsEnabled()) {
    providers.push("gemini_tts");
  }
  return providers;
}

function ttsProviderForLanguage(language) {
  return ttsProviderCandidatesForLanguage(language)[0] || "browser";
}

function publicTtsConfig() {
  const englishProvider = ttsProviderForLanguage("english");
  const hindiProvider = ttsProviderForLanguage("hindi");
  const teluguProvider = ttsProviderForLanguage("telugu");

  if (
    englishProvider === "browser" &&
    hindiProvider === "browser" &&
    teluguProvider === "browser"
  ) {
    return {
      provider: "browser",
      femaleVoice: "",
      maleVoice: "",
      available: false,
      status: "disabled",
      error: "Server-side speech is disabled on this host.",
      fallbackProvider: "browser",
      languageProviders: {
        english: "browser",
        hindi: "browser",
        telugu: "browser"
      },
      nativeVoices: {
        hindi: "",
        telugu: ""
      }
    };
  }

  return {
    provider: englishProvider,
    femaleVoice:
      englishProvider === "kokoro_server"
        ? KOKORO_TTS_VOICES.female.label
        : englishProvider === "gemini_tts"
          ? PREMIUM_TTS_VOICES.female
          : "",
    maleVoice:
      englishProvider === "kokoro_server"
        ? KOKORO_TTS_VOICES.male.label
        : englishProvider === "gemini_tts"
          ? PREMIUM_TTS_VOICES.male
          : "",
    available:
      englishProvider === "kokoro_server"
        ? state.kokoroStatus !== "error"
        : englishProvider === "gemini_tts"
          ? state.premiumTtsStatus !== "error"
          : englishProvider !== "browser",
    status:
      englishProvider === "kokoro_server"
        ? state.kokoroStatus
        : englishProvider === "gemini_tts"
          ? state.premiumTtsStatus
          : "ready",
    error:
      englishProvider === "kokoro_server"
        ? state.kokoroStatus === "error"
          ? state.kokoroLastError
          : ""
        : englishProvider === "gemini_tts" && state.premiumTtsStatus === "error"
          ? state.premiumTtsLastError
          : "",
    premiumStatus: state.premiumTtsStatus,
    premiumError: state.premiumTtsLastError,
    fallbackProvider: "browser",
    languageProviders: {
      english: englishProvider,
      hindi: hindiProvider,
      telugu: teluguProvider
    },
    nativeVoices: {
      hindi: "",
      telugu: ""
    },
    premiumVoices: {
      hindi: hindiProvider === "gemini_tts" ? PREMIUM_TTS_VOICES.female : "",
      telugu: teluguProvider === "gemini_tts" ? PREMIUM_TTS_VOICES.female : ""
    }
  };
}

function localSpeechRecognitionEnabled() {
  return !isCloudMode();
}

function speechRecognitionProviderForLanguage(language) {
  return localSpeechRecognitionEnabled() ? "local_whisper" : "browser";
}

function publicSpeechRecognitionConfig() {
  if (!localSpeechRecognitionEnabled()) {
    return {
      provider: "browser",
      available: false,
      status: "disabled",
      error: "Local speech recognition is only available in the desktop app."
    };
  }

  const preferredProvider = speechRecognitionProviderForLanguage(preferredConversationLanguage());
  const localAvailable = state.asrStatus !== "error";
  const premiumFailed = premiumAsrEnabled() && state.premiumAsrStatus === "error";

  return {
    provider: preferredProvider,
    available: localAvailable || !premiumFailed,
    status:
      preferredProvider === "gemini_asr"
        ? premiumFailed && localAvailable
          ? "fallback"
          : state.premiumAsrStatus
        : state.asrStatus,
    error:
      preferredProvider === "gemini_asr"
        ? premiumFailed && !localAvailable
          ? state.premiumAsrLastError
          : ""
        : state.asrStatus === "error"
          ? state.asrLastError
          : "",
    premiumStatus: state.premiumAsrStatus,
    premiumError: state.premiumAsrLastError,
    languageProviders: {
      english: speechRecognitionProviderForLanguage("english"),
      hindi: speechRecognitionProviderForLanguage("hindi"),
      telugu: speechRecognitionProviderForLanguage("telugu"),
      auto: speechRecognitionProviderForLanguage("auto")
    }
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

  return hasGemini ? "gemini" : hasOpenRouter ? "openrouter" : "gemini";
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

function trimPromptText(text, maxChars = PROMPT_TURN_CHAR_LIMIT) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) {
    return "";
  }

  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function knowledgeHistoryAsPrompt(limit = MAX_KNOWLEDGE_TURNS) {
  if (!state.knowledgeHistory.length || limit <= 0) {
    return "";
  }

  return state.knowledgeHistory
    .slice(-limit)
    .map(
      (turn) =>
        `${turn.role === "assistant" ? "Assistant" : "User"}: ${trimPromptText(turn.text)}`
    )
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

function conversationHistoryAsPrompt(limit = MAX_CONVERSATION_TURNS) {
  if (!state.conversationHistory.length || limit <= 0) {
    return "";
  }

  return state.conversationHistory
    .slice(-limit)
    .map(
      (turn) =>
        `${turn.role === "assistant" ? "Assistant" : "User"}: ${trimPromptText(turn.text)}`
    )
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

function defaultAssistantMemory() {
  return {
    recentContacts: [],
    recentApps: [],
    recentUrls: [],
    recentPaths: [],
    recentCommands: [],
    recentShortcuts: []
  };
}

function cloneAssistantMemory() {
  return JSON.parse(JSON.stringify(state.assistantMemory || defaultAssistantMemory()));
}

function normalizeMemoryEntries(entries, mapper) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => mapper(entry))
    .filter(Boolean)
    .sort((left, right) => Number(right.usedAt || 0) - Number(left.usedAt || 0))
    .slice(0, 12);
}

function normalizeAssistantMemory(data) {
  const memory = data && typeof data === "object" ? data : {};
  return {
    recentContacts: normalizeMemoryEntries(memory.recentContacts, (entry) => {
      const contact = cloneContactForContext(entry);
      if (!contact || !contact.displayName) {
        return null;
      }
      return {
        ...contact,
        count: Math.max(1, Number(entry.count || 1)),
        usedAt: Number(entry.usedAt || Date.now())
      };
    }),
    recentApps: normalizeMemoryEntries(memory.recentApps, (entry) => {
      const name = String(entry?.name || "").trim();
      if (!name) {
        return null;
      }
      return {
        name,
        count: Math.max(1, Number(entry.count || 1)),
        usedAt: Number(entry.usedAt || Date.now())
      };
    }),
    recentUrls: normalizeMemoryEntries(memory.recentUrls, (entry) => {
      const url = String(entry?.url || "").trim();
      if (!url) {
        return null;
      }
      return {
        url,
        label: String(entry?.label || url).trim() || url,
        count: Math.max(1, Number(entry.count || 1)),
        usedAt: Number(entry.usedAt || Date.now())
      };
    }),
    recentPaths: normalizeMemoryEntries(memory.recentPaths, (entry) => {
      const targetPath = String(entry?.path || "").trim();
      if (!targetPath) {
        return null;
      }
      return {
        path: targetPath,
        label: String(entry?.label || targetPath).trim() || targetPath,
        count: Math.max(1, Number(entry.count || 1)),
        usedAt: Number(entry.usedAt || Date.now())
      };
    }),
    recentCommands: normalizeMemoryEntries(memory.recentCommands, (entry) => {
      const text = String(entry?.text || "").trim();
      if (!text) {
        return null;
      }
      return {
        text,
        count: Math.max(1, Number(entry.count || 1)),
        usedAt: Number(entry.usedAt || Date.now())
      };
    }),
    recentShortcuts: normalizeMemoryEntries(memory.recentShortcuts, (entry) => {
      const name = String(entry?.name || "").trim();
      if (!name) {
        return null;
      }
      return {
        name,
        count: Math.max(1, Number(entry.count || 1)),
        usedAt: Number(entry.usedAt || Date.now())
      };
    })
  };
}

async function loadAssistantMemory() {
  try {
    const text = await fsp.readFile(ASSISTANT_MEMORY_PATH, "utf8");
    state.assistantMemory = normalizeAssistantMemory(JSON.parse(text));
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`Jarvis could not read assistant memory: ${error.message}`);
    }
    state.assistantMemory = defaultAssistantMemory();
  }
}

async function persistAssistantMemory() {
  await fsp.mkdir(path.dirname(ASSISTANT_MEMORY_PATH), { recursive: true });
  await fsp.writeFile(
    ASSISTANT_MEMORY_PATH,
    JSON.stringify(cloneAssistantMemory(), null, 2) + "\n",
    "utf8"
  );
}

function scheduleAssistantMemoryPersist() {
  if (state.assistantMemoryPersistTimer) {
    clearTimeout(state.assistantMemoryPersistTimer);
  }
  state.assistantMemoryPersistTimer = setTimeout(() => {
    state.assistantMemoryPersistTimer = null;
    persistAssistantMemory().catch(() => {});
  }, 180);
}

function rememberMemoryEntry(bucket, entry, isSame) {
  if (!bucket || !entry || typeof isSame !== "function") {
    return;
  }

  if (!state.assistantMemory) {
    state.assistantMemory = defaultAssistantMemory();
  }

  const list = Array.isArray(state.assistantMemory[bucket]) ? state.assistantMemory[bucket] : [];
  const index = list.findIndex((item) => isSame(item, entry));
  const current = index >= 0 ? list[index] : null;
  const next = {
    ...current,
    ...entry,
    count: Math.max(1, Number(current?.count || 0) + 1),
    usedAt: Date.now()
  };

  if (index >= 0) {
    list.splice(index, 1);
  }
  list.unshift(next);
  state.assistantMemory[bucket] = list.slice(0, 12);
  scheduleAssistantMemoryPersist();
}

function rememberContactMemory(contact) {
  const safeContact = cloneContactForContext(contact);
  if (!safeContact?.displayName) {
    return;
  }
  rememberMemoryEntry(
    "recentContacts",
    safeContact,
    (left, right) =>
      normalizeWhatsappPhone(left?.phone || "") === normalizeWhatsappPhone(right?.phone || "") ||
      normalizeText(left?.displayName || left?.key || "") ===
        normalizeText(right?.displayName || right?.key || "")
  );
}

function rememberAppMemory(name) {
  const safeName = String(name || "").trim();
  if (!safeName) {
    return;
  }
  rememberMemoryEntry(
    "recentApps",
    { name: safeName },
    (left, right) => normalizeText(left?.name || "") === normalizeText(right?.name || "")
  );
}

function rememberUrlMemory(url, label = "") {
  const safeUrl = String(url || "").trim();
  if (!safeUrl) {
    return;
  }
  rememberMemoryEntry(
    "recentUrls",
    {
      url: safeUrl,
      label: String(label || safeUrl).trim() || safeUrl
    },
    (left, right) => String(left?.url || "").trim() === String(right?.url || "").trim()
  );
}

function rememberPathMemory(targetPath, label = "") {
  const safePath = String(targetPath || "").trim();
  if (!safePath) {
    return;
  }
  rememberMemoryEntry(
    "recentPaths",
    {
      path: safePath,
      label: String(label || safePath).trim() || safePath
    },
    (left, right) => String(left?.path || "").trim() === String(right?.path || "").trim()
  );
}

function rememberCommandMemory(text) {
  const safeText = String(text || "").trim();
  if (!safeText) {
    return;
  }
  rememberMemoryEntry(
    "recentCommands",
    { text: safeText },
    (left, right) => normalizeText(left?.text || "") === normalizeText(right?.text || "")
  );
}

function rememberShortcutMemory(name) {
  const safeName = String(name || "").trim();
  if (!safeName) {
    return;
  }
  rememberMemoryEntry(
    "recentShortcuts",
    { name: safeName },
    (left, right) => normalizeText(left?.name || "") === normalizeText(right?.name || "")
  );
}

function recentContactMemory() {
  const entries = state.assistantMemory?.recentContacts;
  return Array.isArray(entries) && entries.length ? cloneContactForContext(entries[0]) : null;
}

function recentAppMemory() {
  const entries = state.assistantMemory?.recentApps;
  return Array.isArray(entries) && entries.length ? String(entries[0].name || "").trim() : "";
}

function recentUrlMemory() {
  const entries = state.assistantMemory?.recentUrls;
  return Array.isArray(entries) && entries.length ? String(entries[0].url || "").trim() : "";
}

function recentPathMemory() {
  const entries = state.assistantMemory?.recentPaths;
  return Array.isArray(entries) && entries.length ? String(entries[0].path || "").trim() : "";
}

function contactMemoryScore(contact) {
  const entries = Array.isArray(state.assistantMemory?.recentContacts)
    ? state.assistantMemory.recentContacts
    : [];
  if (!entries.length || !contact) {
    return 0;
  }

  const phone = normalizeWhatsappPhone(contact.phone || "");
  const key = normalizeText(contact.key || contact.displayName || "");
  const index = entries.findIndex((entry) => {
    const entryPhone = normalizeWhatsappPhone(entry.phone || "");
    const entryKey = normalizeText(entry.key || entry.displayName || "");
    return (phone && entryPhone && phone === entryPhone) || (key && entryKey && key === entryKey);
  });

  return index === -1 ? 0 : entries.length - index;
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

  if (update?.lastContact) {
    rememberContactMemory(update.lastContact);
  }
  if (update?.lastAppName) {
    rememberAppMemory(update.lastAppName);
  }
  if (update?.lastUrl) {
    rememberUrlMemory(update.lastUrl, update.lastUrlLabel || update.lastUrl);
  }
  if (update?.lastPath) {
    rememberPathMemory(update.lastPath, update.lastPathLabel || update.lastPath);
  }
  if (update?.lastUserCommand) {
    rememberCommandMemory(update.lastUserCommand);
  }
  if (update?.lastShortcutName) {
    rememberShortcutMemory(update.lastShortcutName);
  }
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
  const language = effectiveConversationLanguage(`${spokenName} ${message}`);

  if (!contact) {
    return {
      type: "whatsappLookup",
      spokenName: spokenName.trim(),
      message: cleanedMessage
    };
  }

  if (!cleanedMessage) {
    return createReply(localizedResponse("tellMessageToSend", {
      contact: contactLabel(contact)
    }, language), {
      conversationLanguage: language
    });
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
    /^(?:send|message|text)\s+(?:a\s+)?message\s+to\s+(.+?)\s+(?:saying|that|with message)\s+(.+)$/i,
    /^(?:send(?: a)?(?: whatsapp)?(?: message)? to)\s+(.+?)\s+(?:saying|that|with message)\s+(.+)$/i,
    /^(?:send(?: a)?(?: whatsapp)?(?: message)? to)\s+(.+?)\s+(.+)$/i,
    /^(?:send|message|text)\s+(.+?)\s+(?:saying|that|with message)\s+(.+)$/i,
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

  const hindiPatterns = [
    /^(.+?)\s+को\s+(?:व्हाट्सएप|व्हॉट्सऐप|वॉट्सऐप|whatsapp)(?:\s+पर)?\s+(?:मैसेज|message|संदेश)?\s*(?:भेजो|भेजना|करो)\s*(?:कि)?\s+(.+)$/u,
    /^(?:व्हाट्सएप|व्हॉट्सऐप|वॉट्सऐप|whatsapp)\s+(.+?)\s+को\s+(?:कहना|बोलो|message)\s+(.+)$/u
  ];

  for (const pattern of hindiPatterns) {
    const match = withPreambleRemoved.match(pattern);
    if (match) {
      return finalizeMessageIntent(config, match[1], match[2]);
    }
  }

  const teluguPatterns = [
    /^(.+?)\s+(?:కి|కు)\s+(?:వాట్సాప్|వాట్సప్|whatsapp)(?:\s+లో)?\s+(?:మెసేజ్|message)?\s*(?:పంపు|పంపించు|చెప్పు)\s*(?:అని)?\s+(.+)$/u,
    /^(?:వాట్సాప్|వాట్సప్|whatsapp)\s+(.+?)\s+(?:కి|కు)\s*(?:అని)?\s+(.+)$/u
  ];

  for (const pattern of teluguPatterns) {
    const match = withPreambleRemoved.match(pattern);
    if (match) {
      return finalizeMessageIntent(config, match[1], match[2]);
    }
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

function parseConversationLanguageIntent(rawText) {
  const raw = String(rawText || "").trim();
  if (!raw) {
    return null;
  }

  const normalized = normalizeText(raw);
  let language = null;

  const englishMatch = raw.match(
    /(?:switch|talk|speak|reply|respond|chat|converse)(?:\s+(?:to|with)\s+me)?\s+(?:in|using)?\s*(english|hindi|telugu)\b/i
  );
  if (englishMatch) {
    language = normalizeConversationLanguage(englishMatch[1]);
  }

  if (!language) {
    const modeMatch = raw.match(/\b(english|hindi|telugu)\s+mode\b/i);
    if (modeMatch) {
      language = normalizeConversationLanguage(modeMatch[1]);
    }
  }

  if (
    !language &&
    /(?:auto|automatic|default)\s+language\b/i.test(raw)
  ) {
    language = "auto";
  }

  if (
    !language &&
    /(?:हिंदी|हिन्दी)/u.test(raw) &&
    /(?:में|मे).*(?:बोलो|बात करो|जवाब दो|उत्तर दो)|(?:बोलो|बात करो|जवाब दो|उत्तर दो)/u.test(raw)
  ) {
    language = "hindi";
  }

  if (
    !language &&
    /(?:अंग्रेज़ी|अंग्रेजी|इंग्लिश)/u.test(raw) &&
    /(?:में|मे).*(?:बोलो|बात करो|जवाब दो|उत्तर दो)|(?:बोलो|बात करो|जवाब दो|उत्तर दो)/u.test(raw)
  ) {
    language = "english";
  }

  if (
    !language &&
    /తెలుగు/u.test(raw) &&
    /(?:లో).*(?:మాట్లాడు|మాట్లాడండి|సమాధానం చెప్పు|చెప్పు)|(?:మాట్లాడు|మాట్లాడండి|చెప్పు)/u.test(raw)
  ) {
    language = "telugu";
  }

  if (
    !language &&
    /ఇంగ్లీష్/u.test(raw) &&
    /(?:లో).*(?:మాట్లాడు|మాట్లాడండి|సమాధానం చెప్పు|చెప్పు)|(?:మాట్లాడు|మాట్లాడండి|చెప్పు)/u.test(raw)
  ) {
    language = "english";
  }

  if (
    !language &&
    /\benglish\b/i.test(raw) &&
    /\b(?:speak|talk|reply|respond|language)\b/i.test(raw)
  ) {
    language = "english";
  }

  if (!language) {
    return null;
  }

  return {
    type: "setConversationLanguage",
    language
  };
}

function parseFollowUpMessageIntent(rawText) {
  const lastContact = state.sessionContext.lastContact || recentContactMemory();
  if (!lastContact) {
    return null;
  }

  const patterns = [
    /^(?:send|message|text|whatsapp)\s+(?:the\s+)?same\s+(?:person|contact)\s+(?:saying|that|with message)\s+(.+)$/i,
    /^(?:send|message|text|whatsapp)\s+to\s+(?:the\s+)?same\s+(?:person|contact)\s+(?:saying|that|with message)\s+(.+)$/i,
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

function parseScheduledMessagesIntent(rawText) {
  return /^(?:show|list|check)\s+(?:my\s+)?scheduled messages$/i.test(String(rawText || "").trim())
    ? { type: "showScheduledMessages" }
    : null;
}

function parseCancelScheduledMessageIntent(rawText) {
  const match = String(rawText || "")
    .trim()
    .match(
      /^(?:cancel|delete|remove)\s+(?:the\s+)?scheduled\s+(?:whatsapp|message)(?:\s+number)?\s*(.+)?$/i
    );
  if (!match) {
    return null;
  }

  return {
    type: "cancelScheduledMessage",
    selectorText: String(match[1] || "").trim()
  };
}

function parseRescheduleScheduledMessageIntent(rawText) {
  const text = String(rawText || "").trim();
  const match = text.match(
    /^(?:reschedule|move|change)\s+(?:the\s+)?scheduled\s+(?:whatsapp|message)(?:\s+number)?\s*(.+?)\s+(?:to|for)\s+(.+)$/i
  );
  if (!match) {
    return null;
  }

  const sendAt = parseScheduledDateTimeExpression(match[2]);
  if (!sendAt) {
    return createReply(
      `Tell me the new time clearly, like "reschedule scheduled message 2 to tomorrow at 6 pm".`
    );
  }

  return {
    type: "rescheduleScheduledMessage",
    selectorText: String(match[1] || "").trim(),
    sendAt: sendAt.toISOString()
  };
}

function parseEditScheduledMessageIntent(rawText) {
  const text = String(rawText || "").trim();
  const patterns = [
    /^(?:edit|change|update)\s+(?:the\s+)?scheduled\s+(?:whatsapp|message)(?:\s+number)?\s*(.+?)\s+(?:to say|saying|with message)\s+(.+)$/i,
    /^(?:change|update)\s+(?:the\s+)?scheduled\s+(?:whatsapp|message)(?:\s+number)?\s*(.+?)\s+to\s+(.+)$/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }

    const nextMessage = cleanWhatsappMessage(match[2]);
    if (!nextMessage) {
      return createReply(`Tell me the new message text too.`);
    }

    return {
      type: "editScheduledMessage",
      selectorText: String(match[1] || "").trim(),
      message: nextMessage
    };
  }

  return null;
}

function parseScheduledMessageIntent(rawText, config) {
  const extracted = extractScheduledCommand(rawText);
  if (!extracted) {
    return null;
  }

  const explicitScheduleCue = /^(?:please\s+)?(?:schedule|for later)\b/i.test(String(rawText || "").trim());
  if (!explicitScheduleCue && /^at\s+/i.test(extracted.timeText || "")) {
    return null;
  }

  let commandText = extracted.commandText
    .replace(/^(?:please\s+)?schedule\s+/i, "")
    .replace(/^(?:please\s+)?for\s+later\s+/i, "")
    .replace(/^(?:a|an)\s+(?=(?:whatsapp|message|text)\b)/i, "")
    .trim();
  commandText = commandText.replace(/^whatsapp\s+to\s+/i, "send whatsapp to ");
  commandText = commandText.replace(/^(?:message|text)\s+to\s+/i, "send message to ");

  if (!commandText) {
    return null;
  }

  const parsed =
    parseMessageIntent(commandText, config) || parseFollowUpMessageIntent(commandText);
  if (!parsed) {
    return null;
  }
  if (parsed.reply) {
    return parsed;
  }

  const language = effectiveConversationLanguage(rawText);
  const baseIntent = {
    sendAt: extracted.sendAt.toISOString(),
    conversationLanguage: language
  };

  if (parsed.type === "whatsapp") {
    return {
      type: "scheduleWhatsapp",
      ...baseIntent,
      contact: parsed.contact,
      message: parsed.message
    };
  }

  if (parsed.type === "whatsappLookup") {
    return {
      type: "scheduleWhatsappLookup",
      ...baseIntent,
      spokenName: parsed.spokenName,
      message: parsed.message
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
  const match = rawText.match(
    /^(?:open|launch|start|खोलो|खोल दीजिए|khol(?:o|do)?|తెరువు|తెరవండి|ఓపెన్ చెయ్యి|open cheyyi|open cheyi)\s+(.+)$/iu
  );
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

function parseVoiceModeIntent(rawText, config, metadata = {}) {
  const normalized = normalizeText(rawText);
  if (!normalized) {
    return null;
  }

  const voicePatterns = [
    /^(?:change|switch|set)(?: your| the)?(?: voice| voice mode)(?: to)?\s+(male|female)\b/,
    /^(?:use|reply|speak|talk)(?: in| with)?\s+(male|female)\s+voice\b/,
    /^(?:switch to|change to|set to|use)\s+(male|female)(?:\s+voice)?$/
  ];

  let voiceMode = "";
  for (const pattern of voicePatterns) {
    const match = normalized.match(pattern);
    if (match) {
      voiceMode = match[1];
      break;
    }
  }

  if (!voiceMode) {
    if (/^(?:change|switch|set)(?: your| the)?(?: voice| voice mode)\b/.test(normalized)) {
      const language = effectiveConversationLanguage(metadata.rawTranscript || rawText);
      return createReply(
        `Say "${config.assistantName}, change your voice to male" or "${config.assistantName}, change your voice to female."`,
        {
          conversationLanguage: language
        }
      );
    }
    return null;
  }

  const inputSource = normalizeText(metadata.inputSource || "unknown");
  const addressedToAssistant =
    Boolean(metadata.wakeMatched) ||
    parseAssistantAddress(metadata.rawTranscript, config.assistantName).addressed;

  if (inputSource === "speech" && !addressedToAssistant) {
    const language = effectiveConversationLanguage(metadata.rawTranscript || rawText);
    return createReply(
      `Say "${config.assistantName}, change your voice to ${voiceMode}" if you want me to switch voices.`,
      {
        conversationLanguage: language
      }
    );
  }

  return {
    type: "setVoiceMode",
    voiceMode
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

  if (["it", "that"].includes(normalizedTarget) && (state.sessionContext.lastAppName || recentAppMemory())) {
    return {
      type: "quitApp",
      appName: state.sessionContext.lastAppName || recentAppMemory()
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

  if (state.sessionContext.lastAppName || recentAppMemory()) {
    return {
      type: "openApp",
      appName: state.sessionContext.lastAppName || recentAppMemory(),
      label: state.sessionContext.lastAppName || recentAppMemory()
    };
  }

  if (state.sessionContext.lastUrl || recentUrlMemory()) {
    return {
      type: "openUrl",
      url: state.sessionContext.lastUrl || recentUrlMemory(),
      label: state.sessionContext.lastUrl || recentUrlMemory()
    };
  }

  if (state.sessionContext.lastPath || recentPathMemory()) {
    return {
      type: "openPath",
      path: state.sessionContext.lastPath || recentPathMemory(),
      label: state.sessionContext.lastPath || recentPathMemory()
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
  const conversationHistory = conversationHistoryAsPrompt(PROMPT_CONVERSATION_TURNS);
  const preferredLanguage = preferredConversationLanguage();
  const prompt = [
    `You are a planner for ${config.assistantName}, a desktop voice assistant.`,
    `Convert the user's request into safe structured actions when possible.`,
    `Preferred conversation language: ${conversationLanguageLabel(preferredLanguage)}.`,
    preferredLanguage === "auto"
      ? `Mirror the user's language and script in the JSON "response" field.`
      : `Use ${conversationLanguageLabel(preferredLanguage)} in the JSON "response" field.`,
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
    `- Preserve Hindi and Telugu contact names and message text exactly as the user said them.`,
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

function ttsCacheKey(text, voiceMode, language) {
  return `${normalizeConversationLanguage(language) || "english"}|${
    voiceMode === "male" ? "male" : "female"
  }|${String(text || "").trim()}`;
}

function readTtsCache(text, voiceMode, language) {
  const key = ttsCacheKey(text, voiceMode, language);
  const cached = state.ttsCache.get(key);
  if (!cached) {
    return null;
  }

  state.ttsCache.delete(key);
  state.ttsCache.set(key, cached);
  return {
    buffer: Buffer.from(cached.buffer),
    contentType: cached.contentType,
    voiceName: cached.voiceName
  };
}

function writeTtsCache(text, voiceMode, language, audio) {
  const safeText = String(text || "").trim();
  if (!safeText || safeText.length > 180 || !audio?.buffer?.length) {
    return;
  }

  state.ttsCache.set(ttsCacheKey(safeText, voiceMode, language), {
    buffer: Buffer.from(audio.buffer),
    contentType: audio.contentType,
    voiceName: audio.voiceName
  });

  while (state.ttsCache.size > 48) {
    const oldestKey = state.ttsCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    state.ttsCache.delete(oldestKey);
  }
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

function extractOpenRouterDeltaText(payload) {
  const content = payload?.choices?.[0]?.delta?.content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "string"
          ? part
          : typeof part?.text === "string"
            ? part.text
            : ""
      )
      .join("");
  }

  return typeof content === "string" ? content : "";
}

function buildOpenRouterKnowledgeMessages(query, config) {
  const conversationHistory = conversationHistoryAsPrompt(PROMPT_KNOWLEDGE_TURNS);
  const preferredLanguage = preferredConversationLanguage();
  const systemPrompt = [
    `You are ${config.assistantName}, a voice-first desktop assistant.`,
    `Answer clearly and naturally for spoken output.`,
    `Keep replies brief unless the user asks for more detail.`,
    preferredLanguage === "auto"
      ? `Reply in the same language and script the user used.`
      : `Reply in ${conversationLanguageLabel(preferredLanguage)} unless the user explicitly asks for another language.`,
    `Be honest when something may depend on current events or live web data.`,
    `If the user asks for a laptop action that is not currently configured, say that plainly instead of pretending it succeeded.`
  ].join("\n");
  const userPrompt = [
    conversationHistory ? `Recent conversation:\n${conversationHistory}` : "",
    `Current user request: ${trimPromptText(query, 600)}`
  ]
    .filter(Boolean)
    .join("\n\n");

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];
}

async function callOpenRouterPlanner(rawText, config) {
  const apiKey = openRouterApiKey();
  if (!apiKey) {
    return null;
  }

  const plannerContext = summarizePlannerContext(config);
  const conversationHistory = conversationHistoryAsPrompt(PROMPT_CONVERSATION_TURNS);
  const preferredLanguage = preferredConversationLanguage();
  const prompt = [
    `You are a planner for ${config.assistantName}, a desktop voice assistant.`,
    `Convert the user's request into safe structured actions when possible.`,
    `Preferred conversation language: ${conversationLanguageLabel(preferredLanguage)}.`,
    preferredLanguage === "auto"
      ? `Mirror the user's language and script in the JSON "response" field.`
      : `Use ${conversationLanguageLabel(preferredLanguage)} in the JSON "response" field.`,
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
    `- Preserve Hindi and Telugu contact names and message text exactly as the user said them.`,
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

function handleIntent(rawText, config, metadata = {}) {
  const cleanText = stripWakeWords(rawText, config.assistantName);
  const userProfile = readUserProfile();
  const currentName = currentUserDisplayName(userProfile);
  const language = effectiveConversationLanguage(cleanText);

  if (!cleanText.trim()) {
    return createReply(localizedResponse("listening", {}, language), {
      conversationLanguage: language
    });
  }

  if (parseGreetingIntent(cleanText)) {
    return createReply(`Hi ${currentName}.`);
  }

  if (parseIdentityIntent(cleanText)) {
    return createReply(`You are ${currentName}.`);
  }

  const languageIntent = parseConversationLanguageIntent(cleanText);
  if (languageIntent) {
    return languageIntent;
  }

  const renameIntent = parseRenameIntent(cleanText);
  if (renameIntent) {
    return renameIntent;
  }

  const voiceModeIntent = parseVoiceModeIntent(cleanText, config, metadata);
  if (voiceModeIntent) {
    return voiceModeIntent;
  }

  if (parseHelpIntent(cleanText)) {
    return createReply(
      `Showing your command list. You can ask me to open apps, sites, folders, search Google, send WhatsApp messages, run macOS Shortcuts, or answer general questions.`,
      {
        conversationLanguage: language,
        uiPanel: "commands"
      }
    );
  }

  if (parseHistoryIntent(cleanText)) {
    return createReply(`Showing your recent conversation history.`, {
      conversationLanguage: language,
      uiPanel: "history"
    });
  }

  const scheduledMessagesIntent = parseScheduledMessagesIntent(cleanText);
  if (scheduledMessagesIntent) {
    return scheduledMessagesIntent;
  }

  const cancelScheduledIntent = parseCancelScheduledMessageIntent(cleanText);
  if (cancelScheduledIntent) {
    return cancelScheduledIntent;
  }

  const rescheduleScheduledIntent = parseRescheduleScheduledMessageIntent(cleanText);
  if (rescheduleScheduledIntent) {
    return rescheduleScheduledIntent;
  }

  const editScheduledIntent = parseEditScheduledMessageIntent(cleanText);
  if (editScheduledIntent) {
    return editScheduledIntent;
  }

  if (parseClosePanelIntent(cleanText)) {
    return createReply(`Closing the panel.`, {
      conversationLanguage: language,
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

  const scheduledMessageIntent = parseScheduledMessageIntent(cleanText, config);
  if (scheduledMessageIntent) {
    if (scheduledMessageIntent.reply) {
      return scheduledMessageIntent;
    }

    if (scheduledMessageIntent.type === "scheduleWhatsapp") {
      return rememberPending(
        scheduledMessageIntent,
        readyScheduledWhatsappPrompt(
          scheduledMessageIntent.contact,
          scheduledMessageIntent.message,
          scheduledMessageIntent.sendAt,
          scheduledMessageIntent.conversationLanguage || language
        )
      );
    }

    return scheduledMessageIntent;
  }

  const messageIntent = parseMessageIntent(cleanText, config);
  if (messageIntent) {
    return messageIntent;
  }

  const followUpMessageIntent = parseFollowUpMessageIntent(cleanText);
  if (followUpMessageIntent) {
    return followUpMessageIntent;
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
  const conversationHistory = conversationHistoryAsPrompt(PROMPT_KNOWLEDGE_TURNS);
  const preferredLanguage = preferredConversationLanguage();
  const prompt = [
    `You are ${config.assistantName}, a voice-first desktop assistant.`,
    `Answer clearly and naturally for spoken output.`,
    `Keep replies brief unless the user asks for more detail.`,
    preferredLanguage === "auto"
      ? `Reply in the same language and script the user used.`
      : `Reply in ${conversationLanguageLabel(preferredLanguage)} unless the user explicitly asks for another language.`,
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

  const messages = buildOpenRouterKnowledgeMessages(query, config);

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify(
      openRouterRequestBody(
        messages,
        config,
        {
          temperature: 0.15,
          max_tokens: OPENROUTER_FAST_MAX_TOKENS
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

async function callOpenRouterKnowledgeStream(query, config, handlers = {}) {
  const apiKey = openRouterApiKey();
  if (!apiKey) {
    return createReply(
      `World knowledge is ready, but no OpenRouter key is configured yet. Add OPENROUTER_API_KEY to /Users/haindavlyada/Documents/jar/.env and restart the server.`
    );
  }

  const messages = buildOpenRouterKnowledgeMessages(query, config);
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify(
      openRouterRequestBody(messages, config, {
        temperature: 0.15,
        max_tokens: OPENROUTER_FAST_MAX_TOKENS,
        stream: true
      })
    )
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
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

  const reader = response.body?.getReader?.();
  if (!reader) {
    return callOpenRouterKnowledge(query, config);
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let reply = "";

  const processLine = async (line) => {
    const trimmed = String(line || "").trim();
    if (!trimmed || !trimmed.startsWith("data:")) {
      return;
    }

    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") {
      return;
    }

    let payload = null;
    try {
      payload = JSON.parse(data);
    } catch (error) {
      return;
    }

    const deltaText = extractOpenRouterDeltaText(payload);
    if (!deltaText) {
      return;
    }

    reply += deltaText;
    if (typeof handlers.onDelta === "function") {
      await handlers.onDelta(reply, deltaText);
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

  const finalReply = String(reply || "").trim();
  if (!finalReply) {
    return createReply(`OpenRouter returned an empty response. Please try again.`);
  }

  rememberKnowledgeTurn("user", query);
  rememberKnowledgeTurn("assistant", finalReply);

  return createReply(finalReply, {
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
  const clientActions = [];
  for (const step of steps) {
    const intent = plannerStepToIntent(step, config);
    if (!intent) {
      return createReply(
        `I understood the request, but one of the planned actions was not available in the current laptop controls.`
      );
    }
    const result = await executeIntent(intent, config);
    summaries.push(result.reply);
    if (Array.isArray(result.clientActions) && result.clientActions.length) {
      clientActions.push(...result.clientActions);
    }
  }

  return withClientActions(
    createReply(summaries[summaries.length - 1], {
      status: "completed"
    }),
    clientActions
  );
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
  const matches = await lookupMacContacts(spokenName);
  if (Array.isArray(matches)) {
    return matches[0] || null;
  }
  return matches;
}

async function lookupMacContacts(spokenName) {
  if (process.platform !== "darwin") {
    return null;
  }

  const query = normalizeText(spokenName);
  if (!query) {
    return null;
  }

  const sqliteMatches = await lookupMacContactsInSqlite(query, spokenName);
  if (sqliteMatches.length) {
    return sqliteMatches;
  }

  const scriptLines = [
    "const Contacts = Application('/System/Applications/Contacts.app');",
    "const query = " + JSON.stringify(query) + ";",
    "const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9\\u0900-\\u097f\\u0c00-\\u0c7f\\s]/g, ' ').replace(/\\s+/g, ' ').trim();",
    "const queryTokens = normalize(query).split(' ').filter(Boolean);",
    "const matches = [];",
    "for (const person of Contacts.people()) {",
    "  const name = person.name();",
    "  const normalizedName = normalize(name);",
    "  if (!normalizedName) continue;",
    "  let score = 0;",
    "  if (normalizedName === query) score = 100;",
    "  else if (normalizedName.startsWith(query) || query.startsWith(normalizedName)) score = 75;",
    "  else if (normalizedName.includes(query) || query.includes(normalizedName)) score = 55;",
    "  if (queryTokens.length) {",
    "    let tokenHits = 0;",
    "    const nameTokens = normalizedName.split(' ').filter(Boolean);",
    "    for (const token of queryTokens) {",
    "      if (nameTokens.some((nameToken) => nameToken === token || nameToken.startsWith(token) || token.startsWith(nameToken))) tokenHits += 1;",
    "    }",
    "    if (tokenHits === queryTokens.length) score = Math.max(score, 40 + tokenHits * 5);",
    "    else if (tokenHits > 0) score = Math.max(score, 20 + tokenHits * 4);",
    "  }",
    "  if (!score) continue;",
    "  for (const phone of person.phones()) {",
    "    matches.push({ name, phone: phone.value(), score });",
    "  }",
    "}",
    "matches.sort((left, right) => right.score - left.score || left.name.length - right.name.length);",
    "JSON.stringify(matches.slice(0, 5));"
  ];

  try {
    const result = await runOsaScript(scriptLines);
    const parsed = JSON.parse(result.stdout.trim() || "[]");
    const matches = parsed
      .filter((item) =>
        /\d{8,}/.test(String(item.phone || "").replace(/[^\d]/g, ""))
      )
      .map((item) => ({
        displayName: String(item.name || "").trim() || titleCase(spokenName),
        phone: item.phone,
        aliases: [spokenName]
      }));

    matches.sort((left, right) => {
      const memoryDelta = contactMemoryScore(right) - contactMemoryScore(left);
      if (memoryDelta !== 0) {
        return memoryDelta;
      }
      return left.displayName.length - right.displayName.length;
    });

    return matches.length ? matches : null;
  } catch (error) {
    return {
      error:
        /Contacts|not authorized|not permitted|permission/i.test(error.message)
          ? "contacts_permission"
          : "lookup_failed"
    };
  }
}

async function lookupMacContactsInSqlite(query, spokenName) {
  const dbPaths = await addressBookDbPaths();
  for (const dbPath of dbPaths) {
    const matches = await queryAddressBookSqlite(dbPath, query, spokenName);
    if (matches.length) {
      return matches;
    }
  }
  return [];
}

async function addressBookDbPaths() {
  const dbPaths = [];
  const primaryDb = path.join(ADDRESS_BOOK_DIR, "AddressBook-v22.abcddb");
  dbPaths.push(primaryDb);

  try {
    const sourceEntries = await fsp.readdir(path.join(ADDRESS_BOOK_DIR, "Sources"), {
      withFileTypes: true
    });
    for (const entry of sourceEntries) {
      if (!entry.isDirectory()) {
        continue;
      }
      dbPaths.push(path.join(ADDRESS_BOOK_DIR, "Sources", entry.name, "AddressBook-v22.abcddb"));
    }
  } catch (error) {
    return dbPaths;
  }

  return dbPaths;
}

async function queryAddressBookSqlite(dbPath, query, spokenName) {
  try {
    await fsp.access(dbPath, fs.constants.R_OK);
  } catch (error) {
    return [];
  }

  const sql = [
    "SELECT",
    "  c.ZSTRINGFORINDEXING AS idx,",
    "  p.ZFULLNUMBER AS phone",
    "FROM ZABCDCONTACTINDEX c",
    "JOIN ZABCDPHONENUMBER p ON p.ZOWNER = c.ZCONTACT",
    "WHERE c.ZSTRINGFORINDEXING IS NOT NULL",
    "  AND p.ZFULLNUMBER IS NOT NULL",
    "LIMIT 2000;"
  ].join(" ");

  try {
    const result = await runExecFile("sqlite3", ["-json", dbPath, sql]);
    const rows = JSON.parse(result.stdout.trim() || "[]");
    const queryTokens = query.split(" ").filter(Boolean);
    const scoredMatches = [];
    const seen = new Set();
    for (const row of rows) {
      const indexed = normalizeText(row.idx || "");
      const phone = String(row.phone || "").trim();
      if (!indexed || !hasRealPhoneNumber(phone)) {
        continue;
      }

      const nameOnly = collapseRepeatedName(
        indexed
        .replace(/\b\d[\d\s+-]*\b/g, " ")
        .replace(/\s+/g, " ")
        .trim()
      );
      if (!nameOnly) {
        continue;
      }

      let score = 0;
      if (nameOnly === query) {
        score = 100;
      } else if (nameOnly.startsWith(query) || query.startsWith(nameOnly)) {
        score = 80;
      } else if (nameOnly.includes(query) || query.includes(nameOnly)) {
        score = 60;
      }

      if (queryTokens.length) {
        const nameTokens = nameOnly.split(" ").filter(Boolean);
        let tokenHits = 0;
        for (const token of queryTokens) {
          if (nameTokens.some((nameToken) => nameToken === token || nameToken.startsWith(token))) {
            tokenHits += 1;
          }
        }
        if (tokenHits === queryTokens.length) {
          score = Math.max(score, 45 + tokenHits * 8);
        } else if (tokenHits > 0) {
          score = Math.max(score, 20 + tokenHits * 6);
        }
      }

      if (!score) {
        continue;
      }

      const key = `${nameOnly}|${normalizeWhatsappPhone(phone) || phone.replace(/[^\d]/g, "")}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      scoredMatches.push({
        score,
        displayName: titleCase(nameOnly),
        phone,
        aliases: [spokenName]
      });
    }

    return scoredMatches
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.displayName.length - right.displayName.length
      )
      .slice(0, 5);
  } catch (error) {
    return [];
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
        return target
          ? runExecFile("open", ["-a", options.appName, target])
          : runExecFile("open", [options.appName]);
      }
      return target
        ? runExecFile("open", ["-a", options.appName, target])
        : runExecFile("open", ["-a", options.appName]);
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
    state.kokoroModulePromise = Promise.resolve()
      .then(() => require("@huggingface/transformers"))
      .then((transformersModule) => {
        configureTransformersEnvironment(transformersModule);
        return require("kokoro-js");
      })
      .catch((error) => {
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

async function createKokoroSpeechAudio(text, voiceMode, language = "english") {
  const mode = voiceMode === "male" ? "male" : "female";
  const voice = KOKORO_TTS_VOICES[mode];
  const safeText = String(text || "").trim().slice(0, 900);
  if (!safeText) {
    throw new Error("No text provided for speech.");
  }

  try {
    const tts = await getKokoroTts();
    const normalizedLanguage = normalizeConversationLanguage(language) || "english";
    let audio;

    if (normalizedLanguage === "hindi" || normalizedLanguage === "telugu") {
      const phonemes = await phonemizeIndic(safeText, normalizedLanguage);
      if (phonemes) {
        const encoded = tts.tokenizer(phonemes, { truncation: true });
        audio = await tts.generate_from_ids(encoded.input_ids, {
          voice: voice.id,
          speed: mode === "female" ? 1.0 : 0.98
        });
      } else {
        audio = await tts.generate(safeText, {
          voice: voice.id,
          speed: mode === "female" ? 1.0 : 0.98
        });
      }
    } else {
      audio = await tts.generate(safeText, {
        voice: voice.id,
        speed: mode === "female" ? 1.0 : 0.98
      });
    }

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

function premiumVoiceLabel(voiceMode) {
  const mode = voiceMode === "male" ? "male" : "female";
  return `${PREMIUM_TTS_VOICES[mode]} (Gemini)`;
}

function languageInstructionForSpeech(language) {
  const normalizedLanguage = normalizeConversationLanguage(language) || "english";
  if (normalizedLanguage === "hindi") {
    return "Speak naturally in Hindi with clear pronunciation and a warm assistant tone.";
  }
  if (normalizedLanguage === "telugu") {
    return "Speak naturally in Telugu with clear pronunciation and a warm assistant tone.";
  }
  return "Speak naturally in English with clear pronunciation and a warm assistant tone.";
}

async function callPremiumGenerateContent(model, body) {
  const apiKey = premiumApiKey();
  if (!apiKey) {
    throw new Error("Premium Gemini voice is not configured yet.");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.reply ||
      `Premium Gemini request failed with ${response.status}.`;
    throw new Error(message);
  }

  return payload || {};
}

function pcmToWavBuffer(pcmBuffer, sampleRate = PREMIUM_TTS_SAMPLE_RATE, channelCount = 1) {
  const bitsPerSample = 16;
  const blockAlign = channelCount * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, 4, "ascii");
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write("WAVE", 8, 4, "ascii");
  header.write("fmt ", 12, 4, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channelCount, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, 4, "ascii");
  header.writeUInt32LE(pcmBuffer.length, 40);
  return Buffer.concat([header, pcmBuffer]);
}

function geminiAudioBufferFromPayload(payload) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  for (const candidate of candidates) {
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) {
      continue;
    }
    for (const part of parts) {
      const mimeType = String(part?.inlineData?.mimeType || "").trim();
      const base64Data = String(part?.inlineData?.data || "").trim();
      if (!base64Data) {
        continue;
      }
      const rawBuffer = Buffer.from(base64Data, "base64");
      if (/^audio\/wav\b/i.test(mimeType)) {
        return {
          buffer: rawBuffer,
          contentType: "audio/wav"
        };
      }
      if (/^audio\/l16\b/i.test(mimeType)) {
        const match = mimeType.match(/rate=(\d+)/i);
        const sampleRate = match ? Number(match[1]) : PREMIUM_TTS_SAMPLE_RATE;
        return {
          buffer: pcmToWavBuffer(rawBuffer, sampleRate, 1),
          contentType: "audio/wav"
        };
      }
    }
  }
  throw new Error("Premium Gemini did not return any playable audio.");
}

async function createPremiumSpeechAudio(text, voiceMode, language = "english") {
  const mode = voiceMode === "male" ? "male" : "female";
  const safeText = String(text || "").trim().slice(0, 1200);
  if (!safeText) {
    throw new Error("No text provided for speech.");
  }

  state.premiumTtsStatus = "loading";
  state.premiumTtsLastError = "";
  try {
    const payload = await callPremiumGenerateContent(PREMIUM_TTS_MODEL, {
      contents: [
        {
          parts: [
            {
              text: `${languageInstructionForSpeech(language)} Say exactly this text: ${safeText}`
            }
          ]
        }
      ],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: PREMIUM_TTS_VOICES[mode]
            }
          }
        }
      }
    });
    const audio = geminiAudioBufferFromPayload(payload);
    state.premiumTtsStatus = "ready";
    state.premiumTtsLastError = "";
    return {
      buffer: audio.buffer,
      contentType: audio.contentType,
      voiceName: premiumVoiceLabel(mode)
    };
  } catch (error) {
    state.premiumTtsStatus = "error";
    state.premiumTtsLastError = error.message;
    throw error;
  }
}

async function createNativeSpeechAudio(text, voiceMode, language = "english") {
  if (process.platform !== "darwin") {
    throw new Error("Native macOS speech is not available on this platform.");
  }

  const mode = voiceMode === "male" ? "male" : "female";
  const normalizedLanguage = normalizeConversationLanguage(language) || "english";
  const voiceName = nativeVoiceNameForLanguage(normalizedLanguage, mode);
  const safeText = String(text || "").trim().slice(0, 1200);
  if (!safeText) {
    throw new Error("No text provided for speech.");
  }
  if (!voiceName) {
    throw new Error(`No native ${normalizedLanguage} voice is configured on this Mac.`);
  }

  await ensureTtsCacheDir();
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const aiffPath = path.join(TTS_CACHE_DIR, `${token}.aiff`);
  const m4aPath = path.join(TTS_CACHE_DIR, `${token}.m4a`);
  const rate =
    normalizedLanguage === "hindi"
      ? "172"
      : normalizedLanguage === "telugu"
        ? "170"
        : mode === "female"
          ? "182"
          : "176";

  try {
    await runExecFile("/usr/bin/say", [
      "-v",
      voiceName,
      "-r",
      rate,
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

async function createSpeechAudio(text, voiceMode, language = "english") {
  const cachedAudio = readTtsCache(text, voiceMode, language);
  if (cachedAudio) {
    return cachedAudio;
  }

  const providers = ttsProviderCandidatesForLanguage(language);
  const errors = [];
  for (const provider of providers) {
    try {
      let audio = null;
      if (provider === "gemini_tts") {
        audio = await createPremiumSpeechAudio(text, voiceMode, language);
      }

      if (provider === "kokoro_server") {
        audio = await createKokoroSpeechAudio(text, voiceMode, language);
      }

      if (audio) {
        writeTtsCache(text, voiceMode, language, audio);
        return audio;
      }
    } catch (error) {
      errors.push(`${provider}: ${error.message}`);
    }
  }

  if (errors.length) {
    throw new Error(errors.join(" | "));
  }

  throw new Error(`No server-side voice is available for ${language}.`);
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
    await createKokoroSpeechAudio("नमस्ते", "female", "hindi");
    await createKokoroSpeechAudio("నమస్తే", "female", "telugu");
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

function enqueueTranscriptionJob(job) {
  const nextJob = state.transcriptionQueue
    .catch(() => {})
    .then(job);

  state.transcriptionQueue = nextJob.catch(() => {});
  return nextJob;
}

function bundledTransformersCacheDir() {
  return PACKAGED_TRANSFORMERS_CACHE_DIR && fs.existsSync(PACKAGED_TRANSFORMERS_CACHE_DIR)
    ? PACKAGED_TRANSFORMERS_CACHE_DIR
    : "";
}

function configureTransformersEnvironment(transformersModule) {
  const env = transformersModule?.env;
  const cacheDir = bundledTransformersCacheDir();
  if (!env || !cacheDir) {
    return transformersModule;
  }

  const normalizedCacheDir = cacheDir.endsWith(path.sep) ? cacheDir : `${cacheDir}${path.sep}`;
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  env.useFS = true;
  env.useFSCache = true;
  env.cacheDir = normalizedCacheDir;
  env.localModelPath = normalizedCacheDir;
  return transformersModule;
}

function asrLanguageName(language) {
  const normalized = normalizeConversationLanguage(language) || "auto";
  if (normalized === "english") {
    return "english";
  }
  if (normalized === "hindi") {
    return "hindi";
  }
  if (normalized === "telugu") {
    return "telugu";
  }
  return "";
}

function asrModelIdForLanguage(language) {
  const normalized = normalizeConversationLanguage(language) || "auto";
  return normalized === "english" ? ASR_MODEL_IDS.english : ASR_MODEL_IDS.multilingual;
}

function asrModelUsesEnglishOnlyVocabulary(modelId) {
  return /\.en$/i.test(String(modelId || ""));
}

function loadAsrModule() {
  if (!state.asrModulePromise) {
    state.asrModulePromise = Promise.resolve()
      .then(() => require("@huggingface/transformers"))
      .then((transformersModule) => configureTransformersEnvironment(transformersModule))
      .catch((error) => {
        state.asrModulePromise = null;
        throw error;
      });
  }

  return state.asrModulePromise;
}

async function getSpeechRecognitionPipeline(language = "auto") {
  if (!localSpeechRecognitionEnabled()) {
    state.asrStatus = "disabled";
    state.asrLastError = "Local speech recognition is disabled on this host.";
    throw new Error(state.asrLastError);
  }

  const modelId = asrModelIdForLanguage(language);
  if (!state.asrPipelinePromises[modelId]) {
    state.asrStatus = "loading";
    state.asrLastError = "";
    state.asrPipelinePromises[modelId] = (async () => {
      const { pipeline } = await loadAsrModule();
      const transcriber = await pipeline("automatic-speech-recognition", modelId, {
        dtype: "q8"
      });
      state.asrStatus = "ready";
      state.asrLastError = "";
      return transcriber;
    })().catch((error) => {
      state.asrStatus = "error";
      state.asrLastError = error.message;
      delete state.asrPipelinePromises[modelId];
      throw error;
    });
  }

  return state.asrPipelinePromises[modelId];
}

function kickoffSpeechRecognitionWarmup() {
  if (!localSpeechRecognitionEnabled()) {
    state.asrStatus = "disabled";
    state.asrLastError = "Local speech recognition is disabled on this host.";
    return Promise.resolve(null);
  }

  const warmups = [
    getSpeechRecognitionPipeline("english").catch(() => null),
    getSpeechRecognitionPipeline("auto").catch(() => null)
  ];

  return Promise.all(warmups);
}

function decodeWavAudio(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44) {
    throw new Error("The recording is empty or unreadable.");
  }

  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Jarvis expected WAV audio from the microphone.");
  }

  let offset = 12;
  let audioFormat = 0;
  let channelCount = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataOffset = 0;
  let dataLength = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;

    if (chunkId === "fmt ") {
      audioFormat = buffer.readUInt16LE(chunkStart);
      channelCount = buffer.readUInt16LE(chunkStart + 2);
      sampleRate = buffer.readUInt32LE(chunkStart + 4);
      bitsPerSample = buffer.readUInt16LE(chunkStart + 14);
    } else if (chunkId === "data") {
      dataOffset = chunkStart;
      dataLength = chunkSize;
      break;
    }

    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (!dataOffset || !dataLength || !sampleRate || !channelCount) {
    throw new Error("Jarvis could not read that microphone recording.");
  }

  const bytesPerSample = bitsPerSample / 8;
  const frameCount = Math.floor(dataLength / Math.max(bytesPerSample * channelCount, 1));
  const monoSamples = new Float32Array(frameCount);

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    let mixedSample = 0;

    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sampleOffset = dataOffset + (frameIndex * channelCount + channelIndex) * bytesPerSample;
      let sample = 0;

      if (audioFormat === 1 && bitsPerSample === 16) {
        sample = buffer.readInt16LE(sampleOffset) / 32768;
      } else if (audioFormat === 3 && bitsPerSample === 32) {
        sample = buffer.readFloatLE(sampleOffset);
      } else {
        throw new Error("Jarvis only supports 16-bit PCM microphone audio right now.");
      }

      mixedSample += sample;
    }

    monoSamples[frameIndex] = mixedSample / channelCount;
  }

  return {
    sampleRate,
    samples: monoSamples
  };
}

function resampleAudio(samples, inputRate, targetRate) {
  if (!samples?.length || !inputRate || inputRate === targetRate) {
    return samples;
  }

  const outputLength = Math.max(1, Math.round((samples.length * targetRate) / inputRate));
  const output = new Float32Array(outputLength);
  const ratio = inputRate / targetRate;

  for (let index = 0; index < outputLength; index += 1) {
    const position = index * ratio;
    const leftIndex = Math.floor(position);
    const rightIndex = Math.min(leftIndex + 1, samples.length - 1);
    const weight = position - leftIndex;
    output[index] = samples[leftIndex] * (1 - weight) + samples[rightIndex] * weight;
  }

  return output;
}

function normalizeAudioLevels(samples) {
  if (!samples?.length) {
    return samples;
  }

  let peak = 0;
  let energy = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const magnitude = Math.abs(sample);
    if (magnitude > peak) {
      peak = magnitude;
    }
    energy += sample * sample;
  }

  if (!peak) {
    return samples;
  }

  const rms = Math.sqrt(energy / samples.length);
  const peakGain = ASR_TARGET_PEAK / peak;
  const rmsGain = rms > 0 ? ASR_TARGET_RMS / rms : ASR_MAX_GAIN;
  const gain = Math.max(1, Math.min(ASR_MAX_GAIN, peakGain, rmsGain));
  if (Math.abs(gain - 1) < 0.05) {
    return samples;
  }

  const boosted = new Float32Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    boosted[index] = Math.max(-1, Math.min(1, samples[index] * gain));
  }
  return boosted;
}

function trimAudioSilence(samples, sampleRate) {
  if (!samples?.length || !sampleRate) {
    return samples;
  }

  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const magnitude = Math.abs(samples[index]);
    if (magnitude > peak) {
      peak = magnitude;
    }
  }

  if (!peak) {
    return samples;
  }

  const threshold = Math.max(
    ASR_MIN_TRIM_THRESHOLD,
    Math.min(ASR_MAX_TRIM_THRESHOLD, peak * 0.08)
  );

  let start = 0;
  while (start < samples.length && Math.abs(samples[start]) < threshold) {
    start += 1;
  }

  let end = samples.length - 1;
  while (end > start && Math.abs(samples[end]) < threshold) {
    end -= 1;
  }

  if (start === 0 && end === samples.length - 1) {
    return samples;
  }

  const padding = Math.round((sampleRate * ASR_TRIM_PADDING_MS) / 1000);
  const trimmedStart = Math.max(0, start - padding);
  const trimmedEnd = Math.min(samples.length, end + padding + 1);
  return samples.slice(trimmedStart, trimmedEnd);
}

function cleanTranscriptText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function transcriptLooksUsable(text) {
  return cleanTranscriptText(text).replace(/[^\p{L}\p{M}\p{N}]/gu, "").length >= 2;
}

function buildAsrAttempts(language) {
  const normalized = normalizeConversationLanguage(language) || "auto";
  if (normalized === "english") {
    return [
      { language: "english" },
      { language: "auto" }
    ];
  }
  if (normalized === "hindi") {
    return [
      { language: "hindi" },
      { language: "auto" }
    ];
  }
  if (normalized === "telugu") {
    return [
      { language: "telugu" },
      { language: "auto" }
    ];
  }
  return [{ language: "auto" }];
}

async function transcribePreparedAudio(preparedAudio, language) {
  const modelId = asrModelIdForLanguage(language);
  const transcriber = await getSpeechRecognitionPipeline(language);
  const options = {
    chunk_length_s: ASR_CHUNK_LENGTH_S,
    stride_length_s: ASR_STRIDE_LENGTH_S
  };
  const preferredLanguage = asrLanguageName(language);
  if (asrModelUsesEnglishOnlyVocabulary(modelId)) {
    const output = await transcriber(preparedAudio, options);
    return cleanTranscriptText(output?.text || "");
  }

  options.task = "transcribe";
  if (preferredLanguage) {
    options.language = preferredLanguage;
  }
  const output = await transcriber(preparedAudio, options);
  return cleanTranscriptText(output?.text || "");
}

function transcriptionInstruction(language) {
  const normalized = normalizeConversationLanguage(language) || "auto";
  if (normalized === "hindi") {
    return "Transcribe this short voice command exactly. Return only the Hindi transcript in Devanagari. Do not translate or explain.";
  }
  if (normalized === "telugu") {
    return "Transcribe this short voice command exactly. Return only the Telugu transcript in Telugu script. Do not translate or explain.";
  }
  if (normalized === "english") {
    return "Transcribe this short voice command exactly. Return only the English transcript. Do not translate or explain.";
  }
  return "Transcribe this short voice command exactly. Return only the spoken words in the original language and script. Do not translate or explain.";
}

function extractPremiumTranscript(payload) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  for (const candidate of candidates) {
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) {
      continue;
    }
    for (const part of parts) {
      const text = cleanTranscriptText(part?.text || "");
      if (text) {
        return text.replace(/^["'`]+|["'`]+$/g, "").trim();
      }
    }
  }
  return "";
}

async function transcribeWithPremiumAudio(buffer, language) {
  if (!premiumAsrEnabled()) {
    throw new Error("Premium Gemini transcription is not configured yet.");
  }

  state.premiumAsrStatus = "loading";
  state.premiumAsrLastError = "";
  try {
    const payload = await callPremiumGenerateContent(PREMIUM_ASR_MODEL, {
      contents: [
        {
          parts: [
            {
              text: transcriptionInstruction(language)
            },
            {
              inlineData: {
                mimeType: "audio/wav",
                data: buffer.toString("base64")
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: "text/plain"
      }
    });
    const transcript = extractPremiumTranscript(payload);
    state.premiumAsrStatus = "ready";
    state.premiumAsrLastError = "";
    return transcript;
  } catch (error) {
    state.premiumAsrStatus = "error";
    state.premiumAsrLastError = error.message;
    throw error;
  }
}

async function transcribeAudioBuffer(buffer, language) {
  const normalizedLanguage = normalizeConversationLanguage(language) || "auto";
  const { samples, sampleRate } = decodeWavAudio(buffer);
  const maxInputSamples = Math.max(sampleRate * ASR_MAX_INPUT_SECONDS, ASR_SAMPLE_RATE * ASR_MAX_INPUT_SECONDS);
  const clipped = samples.length > maxInputSamples ? samples.slice(0, maxInputSamples) : samples;
  const preparedAudio = normalizeAudioLevels(
    trimAudioSilence(resampleAudio(clipped, sampleRate, ASR_SAMPLE_RATE), ASR_SAMPLE_RATE)
  );

  const preferredProvider = speechRecognitionProviderForLanguage(language);
  if (preferredProvider === "gemini_asr") {
    try {
      const premiumTranscript = await transcribeWithPremiumAudio(buffer, language);
      if (transcriptLooksUsable(premiumTranscript)) {
        return premiumTranscript;
      }
    } catch (error) {
      // Fall back to local Whisper below if premium transcription fails.
    }
  }

  let fallbackTranscript = "";
  for (const attempt of buildAsrAttempts(language)) {
    const transcript = await transcribePreparedAudio(preparedAudio, attempt.language);
    if (transcriptLooksUsable(transcript)) {
      return transcript;
    }
    if (!fallbackTranscript && transcript) {
      fallbackTranscript = transcript;
    }
  }

  if (
    premiumAsrEnabled() &&
    (normalizedLanguage === "auto" ||
      normalizedLanguage === "hindi" ||
      normalizedLanguage === "telugu")
  ) {
    try {
      const premiumTranscript = await transcribeWithPremiumAudio(buffer, language);
      if (transcriptLooksUsable(premiumTranscript)) {
        return premiumTranscript;
      }
      if (!fallbackTranscript && premiumTranscript) {
        fallbackTranscript = premiumTranscript;
      }
    } catch (error) {
      // Keep the local fallback transcript below.
    }
  }

  return fallbackTranscript;
}

function normalizeWhatsappPhone(phone) {
  if (!hasRealPhoneNumber(phone)) {
    return "";
  }

  let digits = String(phone || "").replace(/[^\d]/g, "");
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  // Most local contacts on this machine are saved as 10-digit Indian mobile numbers.
  if (digits.length === 10) {
    digits = `91${digits}`;
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = `91${digits.slice(1)}`;
  }

  return digits;
}

function whatsappUrl(phone, message) {
  const cleanedPhone = normalizeWhatsappPhone(phone);
  return `whatsapp://send?phone=${cleanedPhone}&text=${encodeURIComponent(message)}`;
}

function whatsappFallbackUrl(phone, message) {
  const cleanedPhone = normalizeWhatsappPhone(phone);
  return `https://wa.me/${cleanedPhone}?text=${encodeURIComponent(message)}`;
}

function whatsappAppName(config) {
  return config.apps?.whatsapp || DEFAULT_CONFIG.apps.whatsapp;
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
  if (isCloudMode()) {
    const cloudResult = executeCloudIntent(intent, config);
    if (cloudResult) {
      return cloudResult;
    }
  }

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
    case "setConversationLanguage": {
      rememberSessionContext({
        lastIntentType: "setConversationLanguage",
        preferredLanguage: intent.language
      });
      return createReply(
        localizedResponse(
          "languageSet",
          {
            label: conversationLanguageLabel(intent.language)
          },
          intent.language
        ),
        {
          conversationLanguage: normalizeConversationLanguage(intent.language) || "auto",
          preferredConversationLanguage:
            normalizeConversationLanguage(intent.language) || "auto",
          status: "completed"
        }
      );
    }
    case "setVoiceMode": {
      rememberSessionContext({
        lastIntentType: "setVoiceMode",
        lastVoiceMode: intent.voiceMode
      });
      return createReply(
        intent.voiceMode === "male"
          ? `Okay. I will use my male voice.`
          : `Okay. I will use my female voice.`,
        {
          voiceMode: intent.voiceMode === "male" ? "male" : "female",
          status: "completed"
        }
      );
    }
    case "showScheduledMessages": {
      rememberSessionContext({
        lastIntentType: "showScheduledMessages"
      });
      return createReply(scheduledMessagesSummary(preferredConversationLanguage()), {
        conversationLanguage: preferredConversationLanguage()
      });
    }
    case "cancelScheduledMessage": {
      const target = resolveScheduledMessageSelection(intent.selectorText);
      if (!target) {
        return createReply(
          `I couldn't find that scheduled message. Say "show scheduled messages" first, then say something like "cancel scheduled message 2".`
        );
      }

      await cancelScheduledMessage(target);
      rememberSessionContext({
        lastIntentType: "cancelScheduledMessage",
        lastContact: cloneContactForContext(target.contact)
      });
      const language = target.conversationLanguage || preferredConversationLanguage();
      return createReply(
        `Cancelled scheduled message ${describeScheduledMessage(target, 0, language).replace(/^1\.\s*/, "")}.`,
        {
          conversationLanguage: language,
          status: "cancelled"
        }
      );
    }
    case "rescheduleScheduledMessage": {
      const target = resolveScheduledMessageSelection(intent.selectorText);
      if (!target) {
        return createReply(
          `I couldn't find that scheduled message. Say "show scheduled messages" first, then say something like "reschedule scheduled message 2 to tomorrow at 6 pm".`
        );
      }

      const updated = await updateScheduledMessage(target, {
        sendAt: intent.sendAt
      });
      const language = updated?.conversationLanguage || preferredConversationLanguage();
      rememberSessionContext({
        lastIntentType: "rescheduleScheduledMessage",
        lastContact: cloneContactForContext(updated?.contact || target.contact)
      });
      return createReply(
        `Rescheduled it for ${formatScheduledDateTime(updated.sendAt, language)}.`,
        {
          conversationLanguage: language,
          status: "scheduled"
        }
      );
    }
    case "editScheduledMessage": {
      const target = resolveScheduledMessageSelection(intent.selectorText);
      if (!target) {
        return createReply(
          `I couldn't find that scheduled message. Say "show scheduled messages" first, then say something like "change scheduled message 2 saying I will be late".`
        );
      }

      const updated = await updateScheduledMessage(target, {
        message: intent.message
      });
      const language = updated?.conversationLanguage || preferredConversationLanguage();
      rememberSessionContext({
        lastIntentType: "editScheduledMessage",
        lastContact: cloneContactForContext(updated?.contact || target.contact),
        lastWhatsappMessage: updated?.message || intent.message
      });
      return createReply(
        `Updated the scheduled message to "${updated.message}".`,
        {
          conversationLanguage: language,
          status: "scheduled"
        }
      );
    }
    case "scheduleWhatsapp": {
      if (isCloudMode()) {
        return createReply(
          `Scheduled WhatsApp delivery needs the desktop app running on the laptop that will send it.`
        );
      }

      const language = intent.conversationLanguage || effectiveConversationLanguage(intent.message);
      const record = await saveScheduledWhatsapp(
        intent.contact,
        intent.message,
        intent.sendAt,
        language
      );
      rememberSessionContext({
        lastIntentType: "scheduleWhatsapp",
        lastContact: cloneContactForContext(intent.contact),
        lastWhatsappMessage: intent.message
      });
      return createReply(
        localizedResponse("scheduledWhatsappSaved", {
          contact: contactLabel(intent.contact),
          when: formatScheduledDateTime(record.sendAt, language)
        }, language),
        {
          conversationLanguage: language,
          status: "scheduled"
        }
      );
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
      const language = effectiveConversationLanguage(
        `${contactLabel(intent.contact)} ${intent.message}`
      );
      const resolvedContact = await resolveWhatsappContact(intent.contact);
      if (resolvedContact.error === "contacts_permission") {
        return createReply(
          localizedResponse("contactsPermissionResolve", {
            contact: contactLabel(intent.contact)
          }, language),
          {
            conversationLanguage: language,
            status: "failed"
          }
        );
      }

      if (resolvedContact.error === "lookup_failed") {
        return createReply(
          localizedResponse("contactsLookupResolveFailed", {
            contact: contactLabel(intent.contact)
          }, language),
          {
            conversationLanguage: language,
            status: "failed"
          }
        );
      }

      if (resolvedContact.error || !resolvedContact.contact) {
        return createReply(
          localizedResponse("contactsPhoneMissing", {
            contact: contactLabel(intent.contact)
          }, language),
          {
            conversationLanguage: language,
            status: "failed"
          }
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
        await openItem(primaryUrl, {
          appName: whatsappAppName(config)
        });
      } catch (error) {
        await openItem(whatsappFallbackUrl(contact.phone || "", intent.message));
      }

      if (config.messageDelivery !== "autoSend") {
        return createReply(
          localizedResponse("whatsappDraftReady", {
            contact: contact.displayName || titleCase(contact.key)
          }, language),
          {
            conversationLanguage: language,
            status: "drafted"
          }
        );
      }

      if (process.platform !== "darwin") {
        return createReply(
          `The message draft is ready. Auto-send is only scripted for macOS right now.`
          ,
          {
            conversationLanguage: language,
            status: "drafted"
          }
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
          localizedResponse("whatsappSent", {
            contact: contact.displayName || titleCase(contact.key)
          }, language),
          {
            conversationLanguage: language,
            status: "completed"
          }
        );
      } catch (error) {
        return createReply(
          localizedResponse("whatsappAutoSendPermission", {}, language),
          {
            conversationLanguage: language,
            status: "drafted"
          }
        );
      }
    }
    case "whatsappLookup": {
      const foundContacts = await lookupMacContacts(intent.spokenName);
      if (!foundContacts || (Array.isArray(foundContacts) && !foundContacts.length)) {
        return createReply(
          localizedResponse("contactsNotFound", {
            spokenName: intent.spokenName
          }, effectiveConversationLanguage(intent.spokenName)),
          {
            conversationLanguage: effectiveConversationLanguage(intent.spokenName)
          }
        );
      }

      if (foundContacts.error === "contacts_permission") {
        return createReply(
          localizedResponse("contactsPermissionFind", {
            spokenName: intent.spokenName
          }, effectiveConversationLanguage(intent.spokenName)),
          {
            conversationLanguage: effectiveConversationLanguage(intent.spokenName)
          }
        );
      }

      if (foundContacts.error) {
        return createReply(
          localizedResponse("contactsLookupFailed", {
            spokenName: intent.spokenName
          }, effectiveConversationLanguage(intent.spokenName)),
          {
            conversationLanguage: effectiveConversationLanguage(intent.spokenName)
          }
        );
      }

      if (foundContacts.length > 1) {
        return rememberPending(
          {
            type: "whatsappContactChoice",
            conversationLanguage: effectiveConversationLanguage(intent.spokenName),
            spokenName: intent.spokenName,
            message: intent.message,
            contacts: foundContacts
          },
          whatsappChoicePrompt(intent.spokenName, foundContacts)
        );
      }

      const foundContact = foundContacts[0];

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

async function processCommand(rawText, metadata = {}) {
  clearExpiredPending();
  const config = readConfig();
  const language = effectiveConversationLanguage(rawText);

  if (state.pendingAction?.type === "whatsappContactChoice") {
    if (isNegative(rawText)) {
      state.pendingAction = null;
      return createReply(localizedResponse("cancelled", {}, language), {
        conversationLanguage: language,
        status: "cancelled"
      });
    }

    const chosenContact = resolveContactChoiceFromReply(
      rawText,
      state.pendingAction.contacts || []
    );
    if (!chosenContact) {
      return createReply(
        whatsappChoicePrompt(
          state.pendingAction.spokenName,
          state.pendingAction.contacts || []
        )
      );
    }

    const pending = state.pendingAction;
    state.pendingAction = null;
    return rememberPending(
      {
        type: "whatsapp",
        conversationLanguage: pending.conversationLanguage || language,
        contact: chosenContact,
        message: pending.message
      },
      readyWhatsappPrompt(
        chosenContact,
        pending.message,
        config.messageDelivery,
        pending.conversationLanguage || language
      )
    );
  }

  if (state.pendingAction?.type === "scheduleWhatsappContactChoice") {
    if (isNegative(rawText)) {
      state.pendingAction = null;
      return createReply(localizedResponse("cancelled", {}, language), {
        conversationLanguage: language,
        status: "cancelled"
      });
    }

    const chosenContact = resolveContactChoiceFromReply(
      rawText,
      state.pendingAction.contacts || []
    );
    if (!chosenContact) {
      return createReply(
        whatsappChoicePrompt(
          state.pendingAction.spokenName,
          state.pendingAction.contacts || []
        )
      );
    }

    const pending = state.pendingAction;
    state.pendingAction = null;
    return rememberPending(
      {
        type: "scheduleWhatsapp",
        conversationLanguage: pending.conversationLanguage || language,
        contact: chosenContact,
        message: pending.message,
        sendAt: pending.sendAt
      },
      readyScheduledWhatsappPrompt(
        chosenContact,
        pending.message,
        pending.sendAt,
        pending.conversationLanguage || language
      )
    );
  }

  if (!state.pendingAction && (isAffirmative(rawText) || isNegative(rawText))) {
    return createReply(localizedResponse("noPendingAction", {}, language), {
      conversationLanguage: language
    });
  }

  if (state.pendingAction) {
    if (isAffirmative(rawText)) {
      const pending = state.pendingAction;
      state.pendingAction = null;
      return executeIntent(pending, config);
    }
    if (isNegative(rawText)) {
      state.pendingAction = null;
      return createReply(localizedResponse("cancelled", {}, language), {
        conversationLanguage: language,
        status: "cancelled"
      });
    }
  }

  const intent = handleIntent(rawText, config, metadata);
  if (!intent) {
    const cleanText = stripWakeWords(rawText, config.assistantName);
    const looksLikeDeviceControl = looksLikeDeviceControlRequest(cleanText);

    if (!looksLikeDeviceControl && config.knowledge?.enabled !== false) {
      return callGeminiKnowledge(cleanText, config);
    }

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
      if (!looksLikeDeviceControl && config.knowledge?.enabled !== false) {
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

  if (intent.type === "whatsappLookup") {
    if (isCloudMode()) {
      const phone = normalizeWhatsappPhone(intent.spokenName || "");
      if (phone) {
        const hostedContact = {
          displayName: intent.spokenName,
          phone,
          aliases: [intent.spokenName]
        };
        return rememberPending(
          {
            type: "whatsapp",
            conversationLanguage: language,
            contact: hostedContact,
            message: intent.message
          },
          readyWhatsappPrompt(
            hostedContact,
            intent.message,
            "draft",
            language
          )
        );
      }

      return createReply(
        `In the hosted version, WhatsApp works with saved contacts in config or direct phone numbers. Add ${intent.spokenName} to config/assistant.config.json, or say the number directly.`,
        {
          conversationLanguage: language
        }
      );
    }

    const foundContacts = await lookupMacContacts(intent.spokenName);
    if (!foundContacts || (Array.isArray(foundContacts) && !foundContacts.length)) {
      return createReply(
        localizedResponse("contactsNotFound", {
          spokenName: intent.spokenName
        }, language),
        {
          conversationLanguage: language
        }
      );
    }

    if (foundContacts.error === "contacts_permission") {
      return createReply(
        localizedResponse("contactsPermissionFind", {
          spokenName: intent.spokenName
        }, language),
        {
          conversationLanguage: language
        }
      );
    }

    if (foundContacts.error) {
      return createReply(
        localizedResponse("contactsLookupFailed", {
          spokenName: intent.spokenName
        }, language),
        {
          conversationLanguage: language
        }
      );
    }

    if (foundContacts.length > 1) {
      return rememberPending(
        {
          type: "whatsappContactChoice",
          conversationLanguage: language,
          spokenName: intent.spokenName,
          message: intent.message,
          contacts: foundContacts
        },
        whatsappChoicePrompt(intent.spokenName, foundContacts)
      );
    }

    return rememberPending(
      {
        type: "whatsapp",
        conversationLanguage: language,
        contact: foundContacts[0],
        message: intent.message
      },
      readyWhatsappPrompt(
        foundContacts[0],
        intent.message,
        config.messageDelivery,
        language
      )
    );
  }

  if (intent.type === "scheduleWhatsappLookup") {
    if (isCloudMode()) {
      return createReply(
        `Scheduled WhatsApp delivery needs the desktop app running on the laptop that will send it.`,
        {
          conversationLanguage: language
        }
      );
    }

    const foundContacts = await lookupMacContacts(intent.spokenName);
    if (!foundContacts || (Array.isArray(foundContacts) && !foundContacts.length)) {
      return createReply(
        localizedResponse("contactsNotFound", {
          spokenName: intent.spokenName
        }, language),
        {
          conversationLanguage: language
        }
      );
    }

    if (foundContacts.error === "contacts_permission") {
      return createReply(
        localizedResponse("contactsPermissionFind", {
          spokenName: intent.spokenName
        }, language),
        {
          conversationLanguage: language
        }
      );
    }

    if (foundContacts.error) {
      return createReply(
        localizedResponse("contactsLookupFailed", {
          spokenName: intent.spokenName
        }, language),
        {
          conversationLanguage: language
        }
      );
    }

    if (foundContacts.length > 1) {
      return rememberPending(
        {
          type: "scheduleWhatsappContactChoice",
          conversationLanguage: language,
          spokenName: intent.spokenName,
          message: intent.message,
          sendAt: intent.sendAt,
          contacts: foundContacts
        },
        whatsappChoicePrompt(intent.spokenName, foundContacts)
      );
    }

    return rememberPending(
      {
        type: "scheduleWhatsapp",
        conversationLanguage: language,
        contact: foundContacts[0],
        message: intent.message,
        sendAt: intent.sendAt
      },
      readyScheduledWhatsappPrompt(
        foundContacts[0],
        intent.message,
        intent.sendAt,
        language
      )
    );
  }

  if (intent.type === "whatsapp") {
    return rememberPending(
      {
        ...intent,
        conversationLanguage: language
      },
      readyWhatsappPrompt(
        intent.contact,
        intent.message,
        config.messageDelivery,
        language
      )
    );
  }

  if (intent.type === "scheduleWhatsapp") {
    return rememberPending(
      {
        ...intent,
        conversationLanguage: language
      },
      readyScheduledWhatsappPrompt(
        intent.contact,
        intent.message,
        intent.sendAt,
        language
      )
    );
  }

  if (intent.reply) {
    return intent;
  }
  return applyTurnConversationLanguage(
    await executeIntent(intent, config),
    rawText
  );
}

function rememberCommandExchange(userText, assistantReply) {
  rememberConversationTurn("user", userText);
  rememberConversationTurn("assistant", assistantReply);
  rememberSessionContext({
    lastUserCommand: userText,
    lastAssistantReply: assistantReply
  });
}

function writeStreamEvent(response, payload) {
  response.write(`${JSON.stringify(payload)}\n`);
}

function streamableKnowledgeCandidate(rawText, metadata = {}) {
  clearExpiredPending();
  const config = readConfig();
  if (state.pendingAction) {
    return null;
  }

  const intent = handleIntent(rawText, config, metadata);
  if (intent) {
    return null;
  }

  const cleanText = stripWakeWords(rawText, config.assistantName);
  if (!cleanText || looksLikeDeviceControlRequest(cleanText) || config.knowledge?.enabled === false) {
    return null;
  }

  if (activeKnowledgeProvider(config) !== "openrouter") {
    return null;
  }

  return {
    config,
    cleanText
  };
}

async function streamCommandResponse(response, transcript, commandMetadata) {
  const rawTranscript = String(commandMetadata.rawTranscript || transcript).trim() || transcript;
  const streamCandidate = streamableKnowledgeCandidate(transcript, commandMetadata);

  if (!streamCandidate) {
    const result = applyTurnConversationLanguage(
      await processCommand(transcript, commandMetadata),
      rawTranscript
    );
    rememberCommandExchange(transcript, result.reply);
    writeStreamEvent(response, {
      type: "final",
      payload: result
    });
    return;
  }

  writeStreamEvent(response, {
    type: "meta",
    conversationLanguage: effectiveConversationLanguage(rawTranscript),
    mode: "knowledge_stream"
  });

  const result = applyTurnConversationLanguage(
    await callOpenRouterKnowledgeStream(streamCandidate.cleanText, streamCandidate.config, {
      onDelta: async (fullText) => {
        writeStreamEvent(response, {
          type: "delta",
          text: fullText
        });
      }
    }),
    rawTranscript
  );

  rememberCommandExchange(transcript, result.reply);
  writeStreamEvent(response, {
    type: "final",
    payload: result
  });
}

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);
    if (isAgentMode()) {
      setCorsHeaders(response, request.headers.origin || "*");
      if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/status") {
      sendJson(response, 200, publicStatus());
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/config") {
      sendJson(response, 200, publicConfig(readConfig()));
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/command-stream") {
      const body = await readBody(request);
      const payload = body ? JSON.parse(body) : {};
      const transcript = String(payload.transcript || "").trim();
      if (!transcript) {
        response.writeHead(400, {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-store",
          Connection: "keep-alive"
        });
        writeStreamEvent(response, {
          type: "final",
          payload: createReply("I need a command first.")
        });
        response.end();
        return;
      }

      const rawTranscript = String(payload.rawTranscript || transcript).trim() || transcript;
      const commandMetadata = {
        rawTranscript,
        wakeMatched: Boolean(payload.wakeMatched),
        inputSource: String(payload.inputSource || "unknown").trim() || "unknown"
      };

      response.writeHead(200, {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        Connection: "keep-alive"
      });

      await streamCommandResponse(response, transcript, commandMetadata);
      response.end();
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
      const rawTranscript = String(payload.rawTranscript || transcript).trim() || transcript;
      const commandMetadata = {
        rawTranscript,
        wakeMatched: Boolean(payload.wakeMatched),
        inputSource: String(payload.inputSource || "unknown").trim() || "unknown"
      };

      const result = applyTurnConversationLanguage(
        await processCommand(transcript, commandMetadata),
        rawTranscript
      );
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
      const language =
        normalizeConversationLanguage(payload.language) ||
        detectScriptLanguage(text) ||
        "english";

      if (!text) {
        sendJson(response, 400, { reply: "I need text to speak first." });
        return;
      }

      const provider = ttsProviderForLanguage(language);
      if (provider === "browser") {
        sendJson(response, 503, {
          reply: `No server-side ${language} voice is available right now.`,
          fallbackProvider: "browser"
        });
        return;
      }

      try {
        const audio = await enqueueSpeechJob(() =>
          createSpeechAudio(text, voiceMode, language)
        );
        response.writeHead(200, {
          "Content-Type": audio.contentType,
          "Cache-Control": "no-store",
          "X-Jarvis-Voice": audio.voiceName
        });
        response.end(audio.buffer);
      } catch (error) {
        sendJson(response, 503, {
          reply: `Speech generation failed: ${error.message}`
        });
      }
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/transcribe") {
      if (!localSpeechRecognitionEnabled()) {
        sendJson(response, 503, {
          reply: "Local speech recognition is only available in the desktop app."
        });
        return;
      }

      const audioBuffer = await readBinaryBody(request);
      const requestedLanguage =
        normalizeConversationLanguage(request.headers["x-jarvis-language"]) || "auto";

      if (!audioBuffer.length) {
        sendJson(response, 400, {
          reply: "I need microphone audio first."
        });
        return;
      }

      try {
        const text = await enqueueTranscriptionJob(() =>
          transcribeAudioBuffer(audioBuffer, requestedLanguage)
        );
        sendJson(response, 200, {
          text,
          language: requestedLanguage,
          provider: speechRecognitionProviderForLanguage(requestedLanguage)
        });
      } catch (error) {
        sendJson(response, 503, {
          reply: `Voice recognition failed: ${error.message}`
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
    if (response.headersSent) {
      try {
        writeStreamEvent(response, {
          type: "final",
          payload: createReply(`Something went wrong: ${error.message}`, {
            status: "failed"
          })
        });
      } catch (innerError) {
        // Ignore secondary stream write failures.
      }
      response.end();
      return;
    }

    sendJson(response, 500, {
      reply: `Something went wrong: ${error.message}`
    });
  }
});

function serverLabel() {
  const label =
    APP_MODE === "agent"
      ? "Jarvis local device agent"
      : APP_MODE === "cloud"
        ? "Jarvis cloud server"
        : "Jarvis desktop assistant";
  return label;
}

function currentServerInfo(fallbackHost = HOST) {
  const address = server.address();
  if (!address || typeof address === "string") {
    return {
      host: fallbackHost,
      port: PORT,
      url: `http://${fallbackHost}:${PORT}`
    };
  }

  const host =
    address.address === "::" || address.address === "0.0.0.0"
      ? fallbackHost
      : address.address;
  return {
    host,
    port: address.port,
    url: `http://${host}:${address.port}`
  };
}

async function startServer(options = {}) {
  const host = options.host || HOST;
  const port =
    typeof options.port === "number" && Number.isFinite(options.port)
      ? options.port
      : PORT;

  await loadAssistantMemory();
  await startScheduledMessageRunner();
  kickoffKokoroWarmup();
  kickoffSpeechRecognitionWarmup().catch(() => {});

  if (server.listening) {
    return Promise.resolve({
      server,
      ...currentServerInfo(host)
    });
  }

  return new Promise((resolve, reject) => {
    const handleError = (error) => {
      server.off("listening", handleListening);
      reject(error);
    };

    const handleListening = () => {
      server.off("error", handleError);
      resolve({
        server,
        ...currentServerInfo(host)
      });
    };

    server.once("error", handleError);
    server.once("listening", handleListening);
    server.listen(port, host);
  });
}

function stopServer() {
  stopScheduledMessageRunner();
  if (state.assistantMemoryPersistTimer) {
    clearTimeout(state.assistantMemoryPersistTimer);
    state.assistantMemoryPersistTimer = null;
  }
  if (state.assistantMemory) {
    persistAssistantMemory().catch(() => {});
  }
  if (!server.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

module.exports = {
  startServer,
  stopServer,
  server
};

if (require.main === module) {
  startServer()
    .then((info) => {
      const { url } = info;
      const label = serverLabel();
      if (typeof process.send === "function") {
        process.send({
          type: "server-ready",
          ...info
        });
      }
      console.log(`${label} running at ${url}`);
    })
    .catch((error) => {
      if (typeof process.send === "function") {
        process.send({
          type: "server-error",
          message: error.message
        });
      }
      console.error(`Jarvis failed to start: ${error.message}`);
      process.exitCode = 1;
    });

  const shutdown = () => {
    stopServer()
      .catch(() => {})
      .finally(() => {
        process.exit(0);
      });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
