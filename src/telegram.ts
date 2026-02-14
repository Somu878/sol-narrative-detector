import axios from "axios";
import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_ENABLED } from "./config.js";
import { logBuffer, originalConsoleLog } from "./logger.js";
import type { DiscoveredNarrative } from "./types.js";

export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export async function sendTelegram(message: string): Promise<void> {
    if (!TELEGRAM_ENABLED) return;

    try {
        await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: "HTML",
                disable_web_page_preview: true,
            },
            { timeout: 10000 }
        );
    } catch (error) {
        originalConsoleLog("⚠️  Telegram send failed:", error instanceof Error ? error.message : error);
    }
}

export async function sendRunLog(): Promise<void> {
    if (!TELEGRAM_ENABLED || logBuffer.length === 0) return;

    const fullLog = logBuffer.join("\n");

    const MAX_LEN = 4000;
    const header = "📋 <b>Run Log</b>\n\n";
    const chunks: string[] = [];

    if (fullLog.length + header.length <= MAX_LEN) {
        chunks.push(header + `<pre>${escapeHtml(fullLog)}</pre>`);
    } else {
        const lines = fullLog.split("\n");
        let current = "";
        let chunkIndex = 1;

        for (const line of lines) {
            if (current.length + line.length + 1 > MAX_LEN - 200) {
                chunks.push(`📋 <b>Run Log (part ${chunkIndex})</b>\n\n<pre>${escapeHtml(current)}</pre>`);
                chunkIndex++;
                current = line;
            } else {
                current += (current ? "\n" : "") + line;
            }
        }
        if (current) {
            chunks.push(`📋 <b>Run Log (part ${chunkIndex})</b>\n\n<pre>${escapeHtml(current)}</pre>`);
        }
    }

    for (const chunk of chunks) {
        await sendTelegram(chunk);
        if (chunks.length > 1) {
            await new Promise((r) => setTimeout(r, 500));
        }
    }
}

export function buildNarrativeSummaryMessage(
    narratives: DiscoveredNarrative[],
    newCount: number,
    skippedCount: number
): string {
    const lines: string[] = [
        "🚨 <b>Meme Narrative Detector — Analysis Complete</b>",
        "",
        `📊 Found <b>${narratives.length}</b> narrative${narratives.length !== 1 ? "s" : ""} | ✨ ${newCount} new | ⏭️ ${skippedCount} already minted`,
        "",
    ];

    for (const n of narratives) {
        const bar = "█".repeat(n.confidence) + "░".repeat(10 - n.confidence);
        lines.push(`📌 <b>${n.name}</b>  [${bar}] ${n.confidence}/10`);
        lines.push(`   ${n.description}`);
        lines.push(`   Tokens: <code>${n.matchingTokens.join(", ")}</code>`);
        lines.push("");
    }

    return lines.join("\n");
}

export function buildTokenMintedMessage(
    narrative: DiscoveredNarrative,
    mintAddress: string,
    txSignature: string
): string {
    return [
        `✅ <b>Token Minted — ${narrative.name}</b>`,
        "",
        `🪙 <b>${narrative.tokenName}</b> ($${narrative.symbol})`,
        `📊 Confidence: ${narrative.confidence}/10`,
        `💬 ${narrative.description}`,
        "",
        `🔗 Mint: <code>${mintAddress}</code>`,
        `🔗 <a href="https://solscan.io/tx/${txSignature}?cluster=devnet">View on Solscan</a>`,
    ].join("\n");
}
