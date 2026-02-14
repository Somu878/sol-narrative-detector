import fs from "fs";
import { DATA_DIR, HISTORY_FILE } from "./config.js";
import type { HistoryData, HistoryEntry } from "./types.js";

export function loadHistory(): HistoryData {
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

export function saveHistory(history: HistoryData): void {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), "utf-8");
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
