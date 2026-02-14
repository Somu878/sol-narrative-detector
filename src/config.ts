import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DATA_DIR = path.join(__dirname, "..", "data");
export const HISTORY_FILE = path.join(DATA_DIR, "history.json");

export const MAX_TOKENS_PER_RUN = 2;
export const MAX_TOKENS_PER_DAY = 10;
export const MIN_CONFIDENCE = 7;

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
export const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
export const TELEGRAM_ENABLED = !!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
