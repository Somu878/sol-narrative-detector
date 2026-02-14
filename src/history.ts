import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, UPSTASH_ENABLED } from "./config.js";
import type { HistoryData, HistoryEntry } from "./types.js";

// Local filesystem paths (used when Upstash is not configured)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "..", "data");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");

const REDIS_KEY = "narrative_history";

// ─── Upstash Redis helpers ───────────────────────────────

async function redisGet(): Promise<HistoryData> {
    try {
        const response = await axios.get(
            `${UPSTASH_REDIS_REST_URL}/get/${REDIS_KEY}`,
            { headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` }, timeout: 10000 }
        );
        if (response.data?.result) {
            return JSON.parse(response.data.result);
        }
    } catch (error) {
        console.log("⚠️  Could not load history from Redis, starting fresh");
    }
    return { entries: [] };
}

async function redisSet(history: HistoryData): Promise<void> {
    try {
        await axios.post(
            `${UPSTASH_REDIS_REST_URL}`,
            ["SET", REDIS_KEY, JSON.stringify(history)],
            { headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` }, timeout: 10000 }
        );
    } catch (error) {
        console.log("⚠️  Could not save history to Redis:", error instanceof Error ? error.message : error);
    }
}

// ─── Local filesystem helpers ────────────────────────────

function localLoad(): HistoryData {
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            const raw = fs.readFileSync(HISTORY_FILE, "utf-8");
            return JSON.parse(raw);
        }
    } catch (error) {
        console.log("⚠️  Could not load history, starting fresh");
    }
    return { entries: [] };
}

function localSave(history: HistoryData): void {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), "utf-8");
}

// ─── Public API (auto-detects storage backend) ───────────

export async function loadHistory(): Promise<HistoryData> {
    if (UPSTASH_ENABLED) {
        return redisGet();
    }
    return localLoad();
}

export async function saveHistory(history: HistoryData): Promise<void> {
    if (UPSTASH_ENABLED) {
        return redisSet(history);
    }
    localSave(history);
}

export function isNarrativeAlreadyMinted(history: HistoryData, narrativeName: string): HistoryEntry | undefined {
    const normalized = narrativeName.toLowerCase().trim();
    return history.entries.find((entry) => {
        const entryNormalized = entry.narrative.toLowerCase().trim();
        return (
            entryNormalized === normalized ||
            entryNormalized.includes(normalized) ||
            normalized.includes(entryNormalized)
        );
    });
}
