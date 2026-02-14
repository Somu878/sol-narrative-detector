export const MAX_TOKENS_PER_RUN = 2;
export const MAX_TOKENS_PER_DAY = 10;
export const MIN_CONFIDENCE = 7;

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
export const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
export const TELEGRAM_ENABLED = !!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);

// Upstash Redis (for serverless history persistence)
export const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL || "";
export const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
export const UPSTASH_ENABLED = !!(UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN);
