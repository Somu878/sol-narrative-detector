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
import axios from "axios";
import bs58 from "bs58";
import "dotenv/config";

interface TokenData {
  address: string;
  name: string;
  symbol: string;
  priceUsd: string;
  liquidity: string;
  volume24h: string;
}

interface NarrativeTheme {
  name: string;
  keywords: string[];
  tokenName: string;
  symbol: string;
  description: string;
}

const NARRATIVE_THRESHOLD = 3;

const NARRATIVES: NarrativeTheme[] = [
  {
    name: "Dog Meme Revival",
    keywords: ["dog", "bonk", "wif", "shiba", "inu", "puppy", "doge"],
    tokenName: "DogMemeRevival2026",
    symbol: "DOG26",
    description: "Dog memes heating up - BONK/WIF vibes detected! 🐕",
  },
  {
    name: "Cat Season",
    keywords: ["cat", "popcat", "mew", "kitten", "feline", "kitty"],
    tokenName: "CatSeason2026",
    symbol: "CAT26",
    description: "Cat season incoming - POPCAT/MEW style! 🐱",
  },
  {
    name: "Political Memes",
    keywords: ["trump", "maga", "president", "political", "donald"],
    tokenName: "PoliticalMemeToken2026",
    symbol: "POL26",
    description: "Political narrative heating up! 🇺🇸",
  },
  {
    name: "AI Themed",
    keywords: ["ai", "grok", "chatgpt", "openai", "artificial", "neural"],
    tokenName: "AIMemeToken2026",
    symbol: "AI26",
    description: "AI-themed tokens gaining traction! 🤖",
  },
  {
    name: "Exotic Animals",
    keywords: ["goat", "peanut", "pnut", "squirrel", "penguin", "giga", "hippo", "moo", "deng"],
    tokenName: "ExoticAnimalMeme2026",
    symbol: "ANML26",
    description: "Exotic animal memes rising! 🐐",
  },
  {
    name: "Food Memes",
    keywords: ["pizza", "burger", "cookie", "banana", "pepe", "frog"],
    tokenName: "FoodMemeToken2026",
    symbol: "FOOD26",
    description: "Food-themed memes cooking! 🍕",
  },
];



async function fetchDexScreenerTokens(): Promise<TokenData[]> {
  const allTokens: Map<string, TokenData> = new Map();

  // Strategy 1: Search for meme-related terms on Solana
  const searchQueries = ["dog meme", "cat meme", "pepe", "ai token", "trump", "bonk", "wif", "popcat"];

  for (const query of searchQueries) {
    try {
      const response = await axios.get(
        `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`,
        { timeout: 10000 }
      );
      const pairs = response.data?.pairs || [];
      // Filter to Solana chain only
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

  // Strategy 2: Get trending/boosted tokens and filter to Solana
  try {
    const boostResponse = await axios.get(
      "https://api.dexscreener.com/token-boosts/top/v1",
      { timeout: 10000 }
    );
    const boostedTokens = boostResponse.data || [];
    const solanaBoosted = boostedTokens.filter((t: any) => t.chainId === "solana");

    // For each boosted Solana token, fetch its pair data
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

function detectNarratives(tokens: TokenData[]): { narrative: NarrativeTheme; matches: TokenData[] }[] {
  const results: { narrative: NarrativeTheme; matches: TokenData[] }[] = [];

  for (const narrative of NARRATIVES) {
    const matches = tokens.filter((token) => {
      const searchText = `${token.name} ${token.symbol}`.toLowerCase();
      return narrative.keywords.some(
        (keyword) => searchText.includes(keyword.toLowerCase())
      );
    });

    if (matches.length >= NARRATIVE_THRESHOLD) {
      results.push({ narrative, matches });
    }
  }

  return results;
}

function createTokenName(narrativeName: string, timestamp: number): { name: string; symbol: string } {
  const baseNames: Record<string, { name: string; symbol: string }> = {
    "Dog Meme Revival": { name: "DogMemeRevival2026", symbol: "DOG26" },
    "Cat Season": { name: "CatSeason2026", symbol: "CAT26" },
    "Political Memes": { name: "PoliticalMemeToken2026", symbol: "POL26" },
    "AI Themed": { name: "AIMemeToken2026", symbol: "AI26" },
    "Exotic Animals": { name: "ExoticAnimalMeme2026", symbol: "ANML26" },
    "Food Memes": { name: "FoodMemeToken2026", symbol: "FOOD26" },
  };

  return baseNames[narrativeName] || { name: "MemeToken2026", symbol: "MEME26" };
}

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

  console.log("\n🔍 Fetching token data from DexScreener...");
  const tokens = await fetchDexScreenerTokens();
  console.log(`📊 Fetched ${tokens.length} tokens`);

  console.log("\n🧠 Analyzing narratives...");
  const detectedNarratives = detectNarratives(tokens);

  if (detectedNarratives.length === 0) {
    console.log("\n❌ No strong narratives detected (need 3+ matching tokens)");
    console.log("💡 Try again later or check API availability");
    process.exit(0);
  }

  console.log("\n" + "=".repeat(60));
  console.log("🚨 NARRATIVES DETECTED!");
  console.log("=".repeat(60));

  for (const { narrative, matches } of detectedNarratives) {
    console.log(`\n📌 ${narrative.name}`);
    console.log(`   Matches: ${matches.length} tokens`);
    console.log(`   Tokens: ${matches.map((m) => m.symbol).join(", ")}`);
    console.log(`   Reason: ${narrative.description}`);

    if (!canCreateToken) {
      console.log("\n⏭️  Skipping token creation (insufficient balance)");
      console.log("   Please fund wallet to create reactive token");
      continue;
    }

    const { name, symbol } = createTokenName(narrative.name, Date.now());

    console.log("\n⛓️  Creating reactive token on devnet...");
    try {
      const result = await createSplToken(
        connection,
        wallet,
        name,
        symbol,
        narrative.description
      );

      console.log("\n✅ TOKEN CREATED SUCCESSFULLY!");
      console.log("─".repeat(60));
      console.log(`   Token Name:    ${name}`);
      console.log(`   Symbol:        ${symbol}`);
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
