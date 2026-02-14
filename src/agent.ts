import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";

// Import logger first — side-effect sets up console.log/error interception
import { resetLogBuffer } from "./logger.js";

import { MAX_TOKENS_PER_RUN, MAX_TOKENS_PER_DAY, MIN_CONFIDENCE, TELEGRAM_ENABLED } from "./config.js";
import type { DiscoveredNarrative } from "./types.js";
import { loadHistory, saveHistory, isNarrativeAlreadyMinted } from "./history.js";
import { sendTelegram, sendRunLog, buildNarrativeSummaryMessage, buildTokenMintedMessage, escapeHtml } from "./telegram.js";
import { fetchDexScreenerTokens } from "./dexscreener.js";
import { discoverNarrativesWithAI } from "./ai.js";
import { createSplToken } from "./solana.js";

export interface AgentResult {
    success: boolean;
    message: string;
    narrativesFound: number;
    tokensMinted: number;
}

export async function runAgent(): Promise<AgentResult> {
    // Reset log buffer (serverless functions may be reused)
    resetLogBuffer();

    console.log("=".repeat(60));
    console.log("🐕 MEME NARRATIVE DETECTOR AGENT - SOLANA DEVNET 🐕");
    console.log("=".repeat(60));

    const privateKeyBase58 = process.env.PRIVATE_KEY;
    if (!privateKeyBase58) {
        console.error("❌ Error: PRIVATE_KEY not set in .env");
        return { success: false, message: "PRIVATE_KEY not set", narrativesFound: 0, tokensMinted: 0 };
    }

    const privateKeyBytes = bs58.decode(privateKeyBase58);
    const wallet = Keypair.fromSecretKey(privateKeyBytes);

    const rpcUrl = process.env.RPC_URL || "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");

    console.log(`\n📡 Connected to: ${rpcUrl}`);
    console.log(`👛 Wallet: ${wallet.publicKey.toBase58().slice(0, 8)}...`);
    console.log(`📱 Telegram: ${TELEGRAM_ENABLED ? "enabled" : "disabled"}`);

    let balance = 0;
    let balanceError = false;
    try {
        balance = await connection.getBalance(wallet.publicKey);
        console.log(`💰 Balance: ${balance / 1e9} SOL`);
    } catch (e: any) {
        console.log(`⚠️  Could not fetch balance: ${e.message?.slice(0, 50) || e}`);
        balanceError = true;
    }

    if (!balanceError && balance < 0.01) {
        console.log("\n⚠️  Low balance, requesting airdrop...");
        const maxRetries = 3;
        for (let i = 0; i < maxRetries; i++) {
            try {
                await new Promise(resolve => setTimeout(resolve, i * 2000));
                const airdropSig = await connection.requestAirdrop(wallet.publicKey, 2e9);
                await connection.confirmTransaction(airdropSig);
                console.log("✅ Airdrop received! (2 SOL)");
                balance = await connection.getBalance(wallet.publicKey);
                break;
            } catch (e: any) {
                console.log(`⚠️  Airdrop attempt ${i + 1} failed: ${e.message?.slice(0, 50) || e}`);
                if (i === maxRetries - 1) {
                    console.log("⚠️  All airdrop attempts failed - you may need manual funding");
                }
            }
        }
    }

    const canCreateToken = balance >= 0.005 * 1e9;

    // Load history
    const history = await loadHistory();
    if (history.entries.length > 0) {
        console.log(`\n📜 History: ${history.entries.length} narratives previously minted`);
        for (const entry of history.entries) {
            console.log(`   • ${entry.narrative} → $${entry.symbol} (${entry.createdAt})`);
        }
    }

    // Step 1: Fetch token data
    console.log("\n🔍 Fetching token data from DexScreener...");
    const tokens = await fetchDexScreenerTokens();
    console.log(`📊 Fetched ${tokens.length} unique tokens`);

    if (tokens.length === 0) {
        console.log("\n❌ No tokens fetched — cannot analyze narratives");
        await sendRunLog();
        return { success: true, message: "No tokens fetched", narrativesFound: 0, tokensMinted: 0 };
    }

    // Step 2: Discover narratives with Groq AI
    console.log("\n🧠 Analyzing narratives with Groq AI...");
    const allNarratives = await discoverNarrativesWithAI(tokens);

    if (allNarratives.length === 0) {
        console.log("\n❌ No strong narratives discovered by AI");
        console.log("💡 Try again later when more tokens are trending");
        await sendRunLog();
        return { success: true, message: "No narratives found", narrativesFound: 0, tokensMinted: 0 };
    }

    // Step 3: Filter out already-minted narratives & low confidence
    console.log("\n" + "=".repeat(60));
    console.log("🚨 AI-DISCOVERED NARRATIVES (sorted by confidence)");
    console.log("=".repeat(60));

    const newNarratives: DiscoveredNarrative[] = [];
    const skippedNarratives: { narrative: DiscoveredNarrative; reason: string }[] = [];

    for (const narrative of allNarratives) {
        const existingEntry = isNarrativeAlreadyMinted(history, narrative.name);

        const scoreBar = "█".repeat(narrative.confidence) + "░".repeat(10 - narrative.confidence);
        console.log(`\n📌 ${narrative.name}  [${scoreBar}] ${narrative.confidence}/10`);
        console.log(`   Matches: ${narrative.matchingTokens.length} tokens`);
        console.log(`   Tokens: ${narrative.matchingTokens.join(", ")}`);
        console.log(`   Reason: ${narrative.description}`);

        if (existingEntry) {
            console.log(`   ⏭️  SKIPPED — already minted as $${existingEntry.symbol} on ${existingEntry.createdAt}`);
            skippedNarratives.push({ narrative, reason: `Already minted as $${existingEntry.symbol}` });
        } else if (narrative.confidence < MIN_CONFIDENCE) {
            console.log(`   ⏭️  SKIPPED — confidence too low (need ${MIN_CONFIDENCE}+)`);
            skippedNarratives.push({ narrative, reason: `Confidence ${narrative.confidence}/10 below threshold ${MIN_CONFIDENCE}` });
        } else {
            console.log(`   ✨ NEW narrative — eligible for minting`);
            newNarratives.push(narrative);
        }
    }

    // Send narrative summary to Telegram
    await sendTelegram(buildNarrativeSummaryMessage(allNarratives, newNarratives.length, skippedNarratives.length));

    // Step 4: Mint tokens for top new narratives
    if (newNarratives.length === 0) {
        console.log("\n📝 All detected narratives have already been minted!");
        console.log("💡 Run again later to catch new emerging trends");
        await sendRunLog();
        return { success: true, message: "All narratives already minted", narrativesFound: allNarratives.length, tokensMinted: 0 };
    }

    // Check daily cap
    const mintedToday = history.entries.filter((e) => {
        const entryDate = new Date(e.createdAt);
        const now = new Date();
        return now.getTime() - entryDate.getTime() < 24 * 60 * 60 * 1000;
    }).length;

    const dailyRemaining = Math.max(0, MAX_TOKENS_PER_DAY - mintedToday);
    if (dailyRemaining === 0) {
        console.log(`\n🚫 Daily cap reached (${MAX_TOKENS_PER_DAY} tokens in 24h). Try again tomorrow.`);
        await sendTelegram(`🚫 <b>Daily cap reached</b>\nAlready minted ${mintedToday} tokens in the last 24h (limit: ${MAX_TOKENS_PER_DAY})`);
        await sendRunLog();
        return { success: true, message: "Daily cap reached", narrativesFound: allNarratives.length, tokensMinted: 0 };
    }

    const mintLimit = Math.min(newNarratives.length, MAX_TOKENS_PER_RUN, dailyRemaining);
    const toMint = newNarratives.slice(0, mintLimit);
    console.log(`\n🎯 Minting ${toMint.length} token${toMint.length > 1 ? "s" : ""} (${newNarratives.length} eligible, ${dailyRemaining} daily remaining)`);

    if (!canCreateToken) {
        console.log("⏭️  Skipping all token creation (insufficient balance)");
        console.log("   Please fund wallet to create reactive tokens");
        await sendRunLog();
        return { success: true, message: "Insufficient balance", narrativesFound: allNarratives.length, tokensMinted: 0 };
    }

    let mintedCount = 0;
    for (const narrative of toMint) {
        console.log("\n⛓️  Creating reactive token on devnet...");
        try {
            const result = await createSplToken(
                connection,
                wallet,
                narrative.tokenName,
                narrative.symbol,
                narrative.description
            );

            // Save to history
            history.entries.push({
                narrative: narrative.name,
                tokenName: narrative.tokenName,
                symbol: narrative.symbol,
                mintAddress: result.mintAddress,
                txSignature: result.signature,
                matchingTokens: narrative.matchingTokens,
                confidence: narrative.confidence,
                createdAt: new Date().toISOString(),
            });
            await saveHistory(history);

            mintedCount++;
            console.log("\n✅ TOKEN CREATED SUCCESSFULLY!");
            console.log("─".repeat(60));
            console.log(`   Token Name:    ${narrative.tokenName}`);
            console.log(`   Symbol:        ${narrative.symbol}`);
            console.log(`   Confidence:    ${narrative.confidence}/10`);
            console.log(`   Mint Address:  ${result.mintAddress}`);
            console.log(`   TX Signature:  ${result.signature}`);
            console.log(`   Explorer:      https://solscan.io/tx/${result.signature}?cluster=devnet`);
            console.log("─".repeat(60));

            // Notify Telegram
            await sendTelegram(buildTokenMintedMessage(narrative, result.mintAddress, result.signature));
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error("❌ Failed to create token:", msg);
            await sendTelegram(`🚨 <b>Token Mint Failed</b>\n${narrative.tokenName} ($${narrative.symbol})\n<code>${escapeHtml(msg.slice(0, 500))}</code>`);
        }
    }

    console.log("\n" + "=".repeat(60));
    console.log(`🎉 Detection cycle complete! Minted ${mintedCount}/${toMint.length} tokens`);
    console.log(`📜 Total narratives in history: ${history.entries.length}`);
    console.log("=".repeat(60));

    // Send full run log to Telegram
    await sendRunLog();

    return {
        success: true,
        message: `Minted ${mintedCount}/${toMint.length} tokens`,
        narrativesFound: allNarratives.length,
        tokensMinted: mintedCount,
    };
}
