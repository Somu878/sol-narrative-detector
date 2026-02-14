import axios from "axios";
import type { TokenData } from "./types.js";
import { sendTelegram, escapeHtml } from "./telegram.js";

export async function fetchDexScreenerTokens(): Promise<TokenData[]> {
    const allTokens: Map<string, TokenData> = new Map();

    // Strategy 1: Search for broad meme-related terms on Solana
    const searchQueries = ["meme", "dog", "cat", "pepe", "ai", "trump", "bonk", "wif", "popcat", "frog"];

    for (const query of searchQueries) {
        try {
            const response = await axios.get(
                `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`,
                { timeout: 10000 }
            );
            const pairs = response.data?.pairs || [];
            const solanaPairs = pairs.filter((pair: any) => pair.chainId === "solana");

            for (const pair of solanaPairs.slice(0, 20)) {
                const address = pair.baseToken?.address || "";
                if (address && !allTokens.has(address)) {
                    allTokens.set(address, {
                        address,
                        name: pair.baseToken?.name || "",
                        symbol: pair.baseToken?.symbol || "",
                        priceUsd: pair.priceUsd || "0",
                        liquidity: pair.liquidity?.usd?.toString() || "0",
                        volume24h: pair.volume?.h24?.toString() || "0",
                    });
                }
            }
            console.log(`   🔎 Search "${query}": found ${solanaPairs.length} Solana pairs`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.log(`   ⚠️  Search "${query}" failed:`, msg);
            await sendTelegram(`⚠️ <b>DexScreener Error</b>\nSearch "${query}" failed: <code>${escapeHtml(msg)}</code>`);
        }
    }

    // Strategy 2: Get trending/boosted tokens filtered to Solana
    try {
        const boostResponse = await axios.get(
            "https://api.dexscreener.com/token-boosts/top/v1",
            { timeout: 10000 }
        );
        const boostedTokens = boostResponse.data || [];
        const solanaBoosted = boostedTokens.filter((t: any) => t.chainId === "solana");

        for (const token of solanaBoosted.slice(0, 10)) {
            try {
                const pairResponse = await axios.get(
                    `https://api.dexscreener.com/tokens/v1/solana/${token.tokenAddress}`,
                    { timeout: 10000 }
                );
                const pairs = pairResponse.data || [];
                if (pairs.length > 0) {
                    const pair = pairs[0];
                    const address = pair.baseToken?.address || token.tokenAddress;
                    if (!allTokens.has(address)) {
                        allTokens.set(address, {
                            address,
                            name: pair.baseToken?.name || "",
                            symbol: pair.baseToken?.symbol || "",
                            priceUsd: pair.priceUsd || "0",
                            liquidity: pair.liquidity?.usd?.toString() || "0",
                            volume24h: pair.volume?.h24?.toString() || "0",
                        });
                    }
                }
            } catch {
                // Skip individual token fetch failures
            }
        }
        console.log(`   🚀 Boosted tokens: found ${solanaBoosted.length} Solana tokens`);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.log("   ⚠️  Boosted tokens fetch failed:", msg);
        await sendTelegram(`⚠️ <b>DexScreener Error</b>\nBoosted tokens fetch failed: <code>${escapeHtml(msg)}</code>`);
    }

    return Array.from(allTokens.values());
}
