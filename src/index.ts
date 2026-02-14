import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createInitializeMintInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import Groq from "groq-sdk";
import axios from "axios";
import bs58 from "bs58";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

// ─── Constants ────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "..", "data");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");
const MAX_TOKENS_PER_RUN = 3;
const MAX_TOKENS_PER_DAY = 5;
const MIN_CONFIDENCE = 7;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const TELEGRAM_ENABLED = !!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);

// ─── Log Buffer ──────────────────────────────────────────

const logBuffer: string[] = [];
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = (...args: any[]) => {
  const line = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  logBuffer.push(line);
  originalConsoleLog.apply(console, args);
};

console.error = (...args: any[]) => {
  const line = "❌ " + args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  logBuffer.push(line);
  originalConsoleError.apply(console, args);
};

// ─── Types ───────────────────────────────────────────────

interface TokenData {
  address: string;
  name: string;
  symbol: string;
  priceUsd: string;
  liquidity: string;
  volume24h: string;
}

interface DiscoveredNarrative {
  name: string;
  description: string;
  tokenName: string;
  symbol: string;
  confidence: number; // 1-10 score from the LLM
  matchingTokens: string[];
}

interface HistoryEntry {
  narrative: string;
  tokenName: string;
  symbol: string;
  mintAddress: string;
  txSignature: string;
  matchingTokens: string[];
  confidence: number;
  createdAt: string;
}

interface HistoryData {
  entries: HistoryEntry[];
}

// ─── History / Persistence ────────────────────────────────

function loadHistory(): HistoryData {
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

function saveHistory(history: HistoryData): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), "utf-8");
}

function isNarrativeAlreadyMinted(history: HistoryData, narrativeName: string): HistoryEntry | undefined {
  // Normalize names for comparison (case-insensitive, trimmed)
  const normalized = narrativeName.toLowerCase().trim();
  return history.entries.find((entry) => {
    const entryNormalized = entry.narrative.toLowerCase().trim();
    // Check for exact match or significant overlap
    return (
      entryNormalized === normalized ||
      entryNormalized.includes(normalized) ||
      normalized.includes(entryNormalized)
    );
  });
}

// ─── Telegram Notifications ──────────────────────────────

async function sendTelegram(message: string): Promise<void> {
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

async function sendRunLog(): Promise<void> {
  if (!TELEGRAM_ENABLED || logBuffer.length === 0) return;

  // Clean up log lines: strip ANSI codes, trim
  const fullLog = logBuffer.join("\n");

  // Telegram message limit is 4096 chars — chunk if needed
  const MAX_LEN = 4000;
  const header = "📋 <b>Run Log</b>\n\n";
  const chunks: string[] = [];

  if (fullLog.length + header.length <= MAX_LEN) {
    chunks.push(header + `<pre>${escapeHtml(fullLog)}</pre>`);
  } else {
    // Split into multiple messages
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
      await new Promise((r) => setTimeout(r, 500)); // avoid rate limit
    }
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildNarrativeSummaryMessage(narratives: DiscoveredNarrative[], newCount: number, skippedCount: number): string {
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

function buildTokenMintedMessage(
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

// ─── DexScreener Data Fetching ────────────────────────────

async function fetchDexScreenerTokens(): Promise<TokenData[]> {
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

// ─── Groq AI Narrative Discovery ──────────────────────────

async function discoverNarrativesWithAI(tokens: TokenData[]): Promise<DiscoveredNarrative[]> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("❌ GROQ_API_KEY not set in .env — cannot discover narratives");
    console.error("   Get a free key at: https://console.groq.com/keys");
    process.exit(1);
  }

  const groq = new Groq({ apiKey });

  // Prepare a concise token list for the prompt
  const tokenList = tokens
    .map((t) => `${t.symbol} (${t.name})`)
    .join(", ");

  const systemPrompt = `You are a meme coin narrative analyst. You analyze lists of Solana meme tokens and identify STRONG narrative themes. You always respond with valid JSON only.`;

  const userPrompt = `Analyze the following list of Solana meme tokens and identify STRONG narrative themes — groups of 3 or more tokens that share a common theme or trend.

TOKEN LIST:
${tokenList}

INSTRUCTIONS:
1. Identify distinct narrative themes (e.g., "Dog Coins", "AI Tokens", "Political Memes", "Frog/Pepe Variants", etc.)
2. Each narrative must have AT LEAST 3 matching tokens from the list
3. A token can only belong to ONE narrative (choose the best fit)
4. For each narrative, suggest a creative token name and 3-5 letter symbol for a reactive token that could be minted in response
5. Rate each narrative with a "confidence" score from 1-10 based on:
   - How many tokens match (more = higher)
   - How clearly the theme is defined (clearer = higher)
   - How trendy/viral the narrative feels (hotter = higher)
6. Only return narratives you are confident about — quality over quantity

Respond with ONLY valid JSON using this exact schema:
{
  "narratives": [
    {
      "name": "Narrative Theme Name",
      "description": "Brief exciting description of why this narrative is trending (include an emoji)",
      "tokenName": "SuggestedTokenName",
      "symbol": "SYM",
      "confidence": 8,
      "matchingTokens": ["TOKEN1", "TOKEN2", "TOKEN3"]
    }
  ]
}

If no strong narratives are found (fewer than 3 tokens matching any theme), return: { "narratives": [] }`;

  console.log("\n🤖 Asking Groq (Llama 3.3 70B) to analyze token narratives...");

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2048,
        response_format: { type: "json_object" },
      });

      const responseText = completion.choices[0]?.message?.content?.trim() || "";

      // Parse the JSON response
      let jsonStr = responseText;
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }

      const parsed = JSON.parse(jsonStr);
      const narratives: DiscoveredNarrative[] = Array.isArray(parsed) ? parsed : (parsed.narratives || parsed.data || []);

      if (!Array.isArray(narratives)) {
        console.log("⚠️  Groq returned invalid format, expected array");
        return [];
      }

      // Validate and ensure confidence scores exist
      const validNarratives = narratives
        .filter(
          (n) =>
            n.name &&
            n.description &&
            n.tokenName &&
            n.symbol &&
            Array.isArray(n.matchingTokens) &&
            n.matchingTokens.length >= 3
        )
        .map((n) => ({
          ...n,
          confidence: typeof n.confidence === "number" ? Math.min(10, Math.max(1, n.confidence)) : 5,
        }));

      // Sort by confidence (highest first)
      validNarratives.sort((a, b) => b.confidence - a.confidence);

      return validNarratives;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      if (errorMsg.includes("429") && attempt < maxRetries) {
        const waitSeconds = attempt * 10;
        console.log(`   ⏳ Rate limited — retrying in ${waitSeconds}s (attempt ${attempt}/${maxRetries})...`);
        await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
        continue;
      }

      console.error("❌ Groq API error:", errorMsg);
      await sendTelegram(`🚨 <b>Groq AI Error</b>\n<code>${escapeHtml(errorMsg.slice(0, 500))}</code>`);
      return [];
    }
  }

  return [];
}

// ─── SPL Token Creation ───────────────────────────────────

async function createSplToken(
  connection: Connection,
  wallet: Keypair,
  name: string,
  symbol: string,
  description: string
): Promise<{ mintAddress: string; signature: string }> {
  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;

  const lamports = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);

  const transaction = new Transaction();

  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: mint,
      space: MINT_SIZE,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(
      mint,
      9,
      wallet.publicKey,
      wallet.publicKey,
      TOKEN_PROGRAM_ID
    )
  );

  const associatedToken = await getAssociatedTokenAddress(
    mint,
    wallet.publicKey
  );

  transaction.add(
    createAssociatedTokenAccountInstruction(
      wallet.publicKey,
      associatedToken,
      wallet.publicKey,
      mint
    )
  );

  const supply = 1_000_000 * 1e9;
  transaction.add(
    createMintToInstruction(
      mint,
      associatedToken,
      wallet.publicKey,
      supply
    )
  );

  console.log(`\n📝 Creating SPL token: ${name} (${symbol})`);
  console.log(`   Description: ${description}`);
  console.log(`   Mint address: ${mint.toBase58()}`);

  const signature = await sendAndConfirmTransaction(connection, transaction, [
    wallet,
    mintKeypair,
  ]);

  return { mintAddress: mint.toBase58(), signature };
}

// ─── Main Agent Loop ──────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("🐕 MEME NARRATIVE DETECTOR AGENT - SOLANA DEVNET 🐕");
  console.log("=".repeat(60));

  const privateKeyBase58 = process.env.PRIVATE_KEY;
  if (!privateKeyBase58) {
    console.error("❌ Error: PRIVATE_KEY not set in .env");
    process.exit(1);
  }

  const privateKeyBytes = bs58.decode(privateKeyBase58);
  const wallet = Keypair.fromSecretKey(privateKeyBytes);

  const rpcUrl = process.env.RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");

  console.log(`\n📡 Connected to: ${rpcUrl}`);
  console.log(`👛 Wallet: ${wallet.publicKey.toBase58().slice(0, 8)}...`);
  console.log(`📱 Telegram: ${TELEGRAM_ENABLED ? "enabled" : "disabled (set TELEGRAM_BOT_TOKEN & TELEGRAM_CHAT_ID to enable)"}`);

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
  const history = loadHistory();
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
    process.exit(0);
  }

  // Step 2: Discover narratives with Groq AI
  console.log("\n🧠 Analyzing narratives with Groq AI...");
  const allNarratives = await discoverNarrativesWithAI(tokens);

  if (allNarratives.length === 0) {
    console.log("\n❌ No strong narratives discovered by AI");
    console.log("💡 Try again later when more tokens are trending");
    process.exit(0);
  }

  // Step 3: Filter out already-minted narratives
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

  // Step 4: Mint tokens for top new narratives (max 3)
  if (newNarratives.length === 0) {
    console.log("\n📝 All detected narratives have already been minted!");
    console.log("💡 Run again later to catch new emerging trends");
    process.exit(0);
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
    process.exit(0);
  }

  const mintLimit = Math.min(newNarratives.length, MAX_TOKENS_PER_RUN, dailyRemaining);
  const toMint = newNarratives.slice(0, mintLimit);
  console.log(`\n🎯 Minting ${toMint.length} token${toMint.length > 1 ? "s" : ""} (${newNarratives.length} eligible, ${dailyRemaining} daily remaining)`);

  if (!canCreateToken) {
    console.log("⏭️  Skipping all token creation (insufficient balance)");
    console.log("   Please fund wallet to create reactive tokens");
    process.exit(0);
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
      saveHistory(history);

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
}

main().catch(console.error);
