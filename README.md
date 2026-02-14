<p align="center">
  <h1 align="center">🐕 Meme Narrative Detector Agent</h1>
  <p align="center">
    <strong>An autonomous Solana agent that uses AI to discover meme coin narratives and reacts on-chain in real time.</strong>
  </p>
  <p align="center">
    <a href="#features">Features</a> •
    <a href="#how-it-works">How It Works</a> •
    <a href="#quick-start">Quick Start</a> •
    <a href="#configuration">Configuration</a> •
    <a href="#contributing">Contributing</a>
  </p>
</p>

---

## 🧐 What is this?

**Meme Narrative Detector** is a TypeScript-powered agent that autonomously scans the Solana meme coin ecosystem, uses **Groq AI (Llama 3.3 70B)** to dynamically discover trending narrative themes, and **reacts on-chain** by minting new SPL tokens on Solana devnet for the strongest narratives.

Unlike static keyword matchers, this agent **discovers narratives it has never seen before** — if a new trend like "Valentine's Day memes" or "anime tokens" emerges, the AI will catch it.

---

## ✨ Features

- **📡 Multi-Source Data** — Fetches live token data from [DexScreener](https://dexscreener.com/) using search queries + trending/boosted tokens
- **🤖 AI-Powered Discovery** — Uses Groq (Llama 3.3 70B) to dynamically identify narrative themes — no hardcoded keywords
- **📊 Confidence Scoring** — Each narrative is rated 1-10 by the AI; only high-confidence narratives (7+) trigger minting
- **🧠 Persistent Memory** — Remembers previously minted narratives in `data/history.json` to avoid duplicates
- **🛡️ Rate Limiting** — Max 3 tokens per run, max 5 tokens per 24 hours
- **📱 Telegram Notifications** — Posts narrative discoveries, token mints, errors, and full run logs to your Telegram bot
- **⛓️ On-Chain Reactions** — Automatically creates SPL tokens on Solana devnet when narratives are detected
- **🔒 Safe by Default** — All operations run on Solana **devnet only** — no real funds involved

---

## 🏗️ How It Works

```
┌─────────────────┐      ┌──────────────────────┐      ┌───────────────────┐      ┌──────────────┐
│                 │      │                      │      │                   │      │              │
│  DexScreener    │─────▶│  Groq AI (LLM)       │─────▶│  SPL Token Mint   │─────▶│  Telegram    │
│  API            │      │  Narrative Discovery │      │  (Solana Devnet)  │      │  Bot         │
│                 │      │                      │      │                   │      │              │
└─────────────────┘      └──────────────────────┘      └───────────────────┘      └──────────────┘
   Multi-strategy            AI analyzes tokens           Mint top 1-3            Notify with
   token fetching            & discovers themes           new narratives          alerts & logs
```

### Detection Pipeline

1. **Fetch** — Pulls Solana meme tokens via DexScreener search API (10 meme queries) + trending/boosted tokens endpoint
2. **Analyze** — Sends all token names/symbols to Groq AI, which dynamically identifies narrative themes and rates confidence 1-10
3. **Filter** — Skips narratives already minted (from history), below confidence threshold (7+), or exceeding daily cap (5/day)
4. **Mint** — For the top 1-3 new narratives, mints an SPL token on devnet with 1,000,000 supply
5. **Notify** — Sends narrative summary, mint alerts, errors, and full run log to Telegram

### Safeguards

| Guard | Limit | Description |
|-------|-------|-------------|
| 🎯 Min Confidence | 7/10 | Only mint narratives the AI is highly confident about |
| 🔄 Per-Run Cap | 3 tokens | Max 3 tokens created per execution |
| 📅 Daily Cap | 5 tokens / 24h | Prevents runaway minting across multiple runs |
| 🧠 Duplicate Check | History file | Never mints the same narrative twice |
| 💰 Balance Check | 0.005 SOL | Skips minting if wallet balance is too low |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and **npm**
- A **Groq API key** (free at [console.groq.com/keys](https://console.groq.com/keys))
- A Solana devnet wallet (or use the built-in generator)
- *(Optional)* A Telegram bot token for notifications

### 1. Clone & Install

```bash
git clone https://github.com/Somu878/sol-narrative-detector.git
cd sol-narrative-detector
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your keys:

```env
# Required
PRIVATE_KEY=your_base58_private_key
GROQ_API_KEY=your_groq_api_key

# Optional — Telegram notifications
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

### 3. Run the Agent

```bash
# Single run
npm start

# Watch mode (auto-restarts on code changes)
npm run dev
```

---

## 📱 Telegram Setup

The agent can send real-time notifications to Telegram. Here's how to set it up:

### 1. Create a Bot
- Message [@BotFather](https://t.me/BotFather) on Telegram
- Send `/newbot` and follow the prompts
- Copy the **bot token** → `TELEGRAM_BOT_TOKEN`

### 2. Get Your Chat ID
- Start a chat with your new bot (press **Start**)
- Send any message (e.g., "hello")
- Visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
- Find `"chat": {"id": 123456789}` → that's your `TELEGRAM_CHAT_ID`

### What Gets Sent

| Message | When |
|---------|------|
| 🚨 **Narrative Summary** | After AI analysis — lists all themes with confidence bars |
| ✅ **Token Minted** | For each token created — name, symbol, Solscan link |
| ⚠️ **Error Alert** | DexScreener failures, Groq API errors, mint failures |
| 📋 **Run Log** | Complete console output at end of each run |

---

## 🔑 Wallet Setup

### Option A: Use the built-in generator

```bash
npx tsx src/generate-wallet.ts
```

This will output a new keypair — copy the `PRIVATE_KEY` value into your `.env` file.

### Option B: Use Solana CLI

```bash
# Generate a new keypair
solana-keygen new -o wallet.json

# Set network to devnet
solana config set --url devnet

# View the public key
solana-keygen pubkey wallet.json
```

### Funding Your Wallet

The agent will **automatically request an airdrop** of 2 SOL on devnet if balance is low. If the airdrop is rate-limited, try:

```bash
# Via Solana CLI
solana airdrop 2 <YOUR_WALLET_ADDRESS> --url devnet

# Via Alchemy RPC (often has better limits)
solana airdrop 2 <YOUR_WALLET_ADDRESS> --url https://solana-devnet.g.alchemy.com/v2/demo
```

Or use the [Solana Web Faucet](https://faucet.solana.com/) (select **devnet**).

---

## ⚙️ Configuration

All configuration is via environment variables in `.env`:

| Variable | Description | Required |
|----------|-------------|----------|
| `PRIVATE_KEY` | Base58-encoded wallet private key | ✅ |
| `GROQ_API_KEY` | Groq API key for AI narrative discovery | ✅ |
| `RPC_URL` | Solana RPC endpoint | Default: `https://api.devnet.solana.com` |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather | Optional |
| `TELEGRAM_CHAT_ID` | Telegram chat ID for notifications | Optional |

### Tunable Constants (in `src/index.ts`)

| Constant | Default | Description |
|----------|---------|-------------|
| `MAX_TOKENS_PER_RUN` | `3` | Max tokens to mint per execution |
| `MAX_TOKENS_PER_DAY` | `5` | Max tokens to mint in a rolling 24h window |
| `MIN_CONFIDENCE` | `7` | Minimum AI confidence score (1-10) to trigger minting |

---

## 📂 Project Structure

```
meme-narrative-detector/
├── src/
│   ├── index.ts              # Main orchestrator: ties everything together
│   ├── types.ts              # Shared TypeScript interfaces
│   ├── config.ts             # Constants and environment config
│   ├── logger.ts             # Console log buffer for Telegram streaming
│   ├── history.ts            # Narrative history persistence & deduplication
│   ├── telegram.ts           # Telegram bot notifications & message builders
│   ├── dexscreener.ts        # DexScreener API data fetching
│   ├── ai.ts                 # Groq AI narrative discovery
│   ├── solana.ts             # SPL token creation on devnet
│   └── generate-wallet.ts    # Utility to generate new Solana keypair
├── data/
│   └── history.json          # Persistent narrative history (auto-created)
├── .env.example              # Environment variable template
├── FUNDING.md                # Manual wallet funding guide
├── package.json              # Dependencies & scripts
├── tsconfig.json             # TypeScript configuration
└── README.md                 # You are here
```

---

## 🖥️ Example Output

```
============================================================
🐕 MEME NARRATIVE DETECTOR AGENT - SOLANA DEVNET 🐕
============================================================

📡 Connected to: https://devnet.helius-rpc.com/...
👛 Wallet: GHBJy5im...
📱 Telegram: enabled
💰 Balance: 4.97 SOL

📜 History: 3 narratives previously minted
   • Meme Mania → $MEM (2026-02-15T...)
   • Canine Craze → $PAW (2026-02-15T...)
   • Pepe Phenomenon → $PEPE (2026-02-15T...)

🔍 Fetching token data from DexScreener...
   🔎 Search "meme": found 22 Solana pairs
   🔎 Search "dog": found 13 Solana pairs
   ...
   🚀 Boosted tokens: found 27 Solana tokens
📊 Fetched 92 unique tokens

🤖 Asking Groq (Llama 3.3 70B) to analyze token narratives...

🚨 AI-DISCOVERED NARRATIVES (sorted by confidence)

📌 Frog Fever  [████████░░] 8/10
   Matches: 8 tokens
   Tokens: FROG, PEPE, RIBBIT...
   Reason: Frog-themed tokens are hopping onto the scene 🐸
   ✨ NEW narrative — eligible for minting

📌 Meme Mania  [█████████░] 9/10
   ⏭️  SKIPPED — already minted as $MEM

🎯 Minting 1 token (1 eligible, 2 daily remaining)

✅ TOKEN CREATED SUCCESSFULLY!
────────────────────────────────────────────────────────────
   Token Name:    FrogForce
   Symbol:        FROG
   Confidence:    8/10
   Mint Address:  4yi6aM...
   Explorer:      https://solscan.io/tx/...?cluster=devnet
────────────────────────────────────────────────────────────

🎉 Detection cycle complete! Minted 1/1 tokens
📜 Total narratives in history: 4
```

---

## 🧰 Tech Stack

| Technology | Purpose |
|------------|---------|
| [TypeScript](https://www.typescriptlang.org/) | Type-safe application logic |
| [Groq SDK](https://console.groq.com/) | AI narrative discovery (Llama 3.3 70B) |
| [@solana/web3.js](https://solana-labs.github.io/solana-web3.js/) | Solana blockchain interaction |
| [@solana/spl-token](https://spl.solana.com/token) | SPL token creation & management |
| [Axios](https://axios-http.com/) | HTTP client for DexScreener & Telegram APIs |
| [bs58](https://www.npmjs.com/package/bs58) | Base58 encoding/decoding for keys |
| [dotenv](https://www.npmjs.com/package/dotenv) | Environment variable management |
| [tsx](https://tsx.is/) | TypeScript execution without build step |

---

## 🛡️ Safety & Disclaimer

> **⚠️ This project operates exclusively on Solana Devnet.**

- ✅ All transactions use **test SOL** — no real funds are at risk
- ✅ DexScreener API is **public and read-only** — no authentication required
- ✅ Created tokens exist **only on devnet** and have no monetary value
- ✅ Rate-limited to **5 tokens per day** to prevent excessive minting
- ❌ Do **NOT** use this with mainnet private keys

---

## 🗺️ Roadmap

- [x] AI-powered narrative discovery (Groq / Llama 3.3 70B)
- [x] Telegram bot notifications
- [x] Persistent narrative history & deduplication
- [x] Confidence scoring & rate limiting
- [ ] Integrate sentiment analysis from social media (Twitter/X, Reddit)
- [ ] Add scheduling / cron-based polling
- [ ] Dashboard UI for visualizing detected narratives
- [ ] Support for mainnet deployment (with proper safeguards)
- [ ] Add Metaplex metadata to minted tokens (name, image, description)

---

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feat/my-feature`
3. **Commit** your changes: `git commit -m "feat: add new narrative theme"`
4. **Push** to the branch: `git push origin feat/my-feature`
5. **Open** a Pull Request

Please follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Built with ❤️ on Solana | Powered by Groq AI
</p>
