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
import "dotenv/config";

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
  matchingTokens: string[]; // symbols of tokens that belong to this narrative
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
      console.log(`   ⚠️  Search "${query}" failed:`, error instanceof Error ? error.message : error);
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
    console.log("   ⚠️  Boosted tokens fetch failed:", error instanceof Error ? error.message : error);
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
5. Only return narratives you are confident about — quality over quantity

Respond with ONLY valid JSON using this exact schema:
[
  {
    "name": "Narrative Theme Name",
    "description": "Brief exciting description of why this narrative is trending (include an emoji)",
    "tokenName": "SuggestedTokenName",
    "symbol": "SYM",
    "matchingTokens": ["TOKEN1", "TOKEN2", "TOKEN3"]
  }
]

If no strong narratives are found (fewer than 3 tokens matching any theme), return an empty array: []`;

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
      // Handle both { narratives: [...] } and [...] formats
      const narratives: DiscoveredNarrative[] = Array.isArray(parsed) ? parsed : (parsed.narratives || parsed.data || []);

      // Validate the response structure
      if (!Array.isArray(narratives)) {
        console.log("⚠️  Groq returned invalid format, expected array");
        return [];
      }

      // Filter out narratives with fewer than 3 matching tokens
      const validNarratives = narratives.filter(
        (n) =>
          n.name &&
          n.description &&
          n.tokenName &&
          n.symbol &&
          Array.isArray(n.matchingTokens) &&
          n.matchingTokens.length >= 3
      );

      return validNarratives;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Check if it's a rate limit error and we have retries left
      if (errorMsg.includes("429") && attempt < maxRetries) {
        const waitSeconds = attempt * 10; // 10s, 20s
        console.log(`   ⏳ Rate limited — retrying in ${waitSeconds}s (attempt ${attempt}/${maxRetries})...`);
        await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
        continue;
      }

      console.error("❌ Groq API error:", errorMsg);
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

  // Step 1: Fetch token data
  console.log("\n🔍 Fetching token data from DexScreener...");
  const tokens = await fetchDexScreenerTokens();
  console.log(`📊 Fetched ${tokens.length} unique tokens`);

  if (tokens.length === 0) {
    console.log("\n❌ No tokens fetched — cannot analyze narratives");
    process.exit(0);
  }

  // Step 2: Discover narratives with Gemini AI
  console.log("\n🧠 Analyzing narratives with Gemini AI...");
  const narratives = await discoverNarrativesWithAI(tokens);

  if (narratives.length === 0) {
    console.log("\n❌ No strong narratives discovered by AI");
    console.log("💡 Try again later when more tokens are trending");
    process.exit(0);
  }

  // Step 3: Display and react to narratives
  console.log("\n" + "=".repeat(60));
  console.log("🚨 AI-DISCOVERED NARRATIVES!");
  console.log("=".repeat(60));

  for (const narrative of narratives) {
    console.log(`\n📌 ${narrative.name}`);
    console.log(`   Matches: ${narrative.matchingTokens.length} tokens`);
    console.log(`   Tokens: ${narrative.matchingTokens.join(", ")}`);
    console.log(`   Reason: ${narrative.description}`);
    console.log(`   Suggested: ${narrative.tokenName} ($${narrative.symbol})`);

    if (!canCreateToken) {
      console.log("\n⏭️  Skipping token creation (insufficient balance)");
      console.log("   Please fund wallet to create reactive token");
      continue;
    }

    console.log("\n⛓️  Creating reactive token on devnet...");
    try {
      const result = await createSplToken(
        connection,
        wallet,
        narrative.tokenName,
        narrative.symbol,
        narrative.description
      );

      console.log("\n✅ TOKEN CREATED SUCCESSFULLY!");
      console.log("─".repeat(60));
      console.log(`   Token Name:    ${narrative.tokenName}`);
      console.log(`   Symbol:        ${narrative.symbol}`);
      console.log(`   Mint Address:  ${result.mintAddress}`);
      console.log(`   TX Signature:  ${result.signature}`);
      console.log(`   Explorer:      https://solscan.io/tx/${result.signature}?cluster=devnet`);
      console.log("─".repeat(60));
    } catch (error) {
      console.error("❌ Failed to create token:", error);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("🎉 Detection cycle complete!");
  console.log("=".repeat(60));
}

main().catch(console.error);
