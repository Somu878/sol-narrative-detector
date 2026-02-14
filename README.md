<p align="center">
  <h1 align="center">🐕 Meme Narrative Detector Agent</h1>
  <p align="center">
    <strong>An autonomous Solana agent that detects meme coin narratives and reacts on-chain in real time.</strong>
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

**Meme Narrative Detector** is a TypeScript-powered agent that autonomously scans the Solana meme coin ecosystem, identifies trending narrative themes (dog coins, cat coins, AI tokens, political memes, etc.), and **reacts on-chain** by minting a new SPL token on Solana devnet when a narrative reaches critical mass.

Think of it as an **automated trend spotter** — it watches the market so you don't have to.

---

## ✨ Features

- **📡 Real-Time Data** — Fetches live token data from the [DexScreener API](https://dexscreener.com/)
- **🧠 Narrative Detection** — Analyzes token names and symbols against 6 predefined narrative themes using keyword matching
- **⛓️ On-Chain Reactions** — Automatically creates SPL tokens on Solana devnet when a narrative threshold (3+ tokens) is met
- **🛡️ Safe by Default** — All operations run on Solana **devnet only** — no real funds involved
- **🔑 Wallet Utilities** — Built-in wallet generation script for quick setup

---

## 🏗️ How It Works

```
┌─────────────────┐      ┌──────────────────────┐      ┌───────────────────┐
│                 │      │                      │      │                   │
│  DexScreener    │─────▶│  Narrative Analysis  │─────▶│  SPL Token Mint   │
│  API / Fallback │      │  Engine              │      │  (Solana Devnet)  │
│                 │      │                      │      │                   │
└─────────────────┘      └──────────────────────┘      └───────────────────┘
    Fetch top 50              Match against               Create new SPL
    Solana tokens             6 narrative themes          token on-chain
```

### Detection Pipeline

1. **Fetch** — Pulls the latest 50 Solana token pairs from the DexScreener API
2. **Analyze** — Scans each token's name and symbol against keyword lists for 6 narrative themes
3. **Detect** — A narrative is "detected" when **3 or more** tokens match its keywords
4. **React** — For each detected narrative, a new SPL token is minted on devnet with 1,000,000 supply

### Supported Narratives

| 🏷️ Theme | 🔑 Keywords | 🪙 Token Created |
|-----------|-------------|------------------|
| 🐕 Dog Meme Revival | `dog`, `bonk`, `wif`, `shiba`, `inu`, `puppy`, `doge` | `DOG26` |
| 🐱 Cat Season | `cat`, `popcat`, `mew`, `kitten`, `feline`, `kitty` | `CAT26` |
| 🇺🇸 Political Memes | `trump`, `maga`, `president`, `political`, `donald` | `POL26` |
| 🤖 AI Themed | `ai`, `grok`, `chatgpt`, `openai`, `artificial`, `neural` | `AI26` |
| 🐐 Exotic Animals | `goat`, `peanut`, `pnut`, `squirrel`, `penguin`, `giga`, `hippo`, `moo`, `deng` | `ANML26` |
| 🍕 Food Memes | `pizza`, `burger`, `cookie`, `banana`, `pepe`, `frog` | `FOOD26` |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and **npm**
- A Solana devnet wallet (or use the built-in generator)

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd meme-narrative-detector
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your private key (see [Wallet Setup](#wallet-setup) below).

### 3. Run the Agent

```bash
# Single run
npm start

# Watch mode (auto-restarts on code changes)
npm run dev
```

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

| Variable | Description | Default |
|----------|-------------|---------|
| `PRIVATE_KEY` | Base58-encoded wallet private key | *(required)* |
| `RPC_URL` | Solana RPC endpoint | `https://api.devnet.solana.com` |
| `POLLING_INTERVAL` | Polling interval in minutes | `30` |

---

## 📂 Project Structure

```
meme-narrative-detector/
├── src/
│   ├── index.ts              # Core agent: fetch → detect → mint
│   └── generate-wallet.ts    # Utility to generate new Solana keypair
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

📡 Connected to: https://api.devnet.solana.com
👛 Wallet: 7xKX4n...
💰 Balance: 2.5 SOL

🔍 Fetching token data from DexScreener...
📊 Fetched 50 tokens

🧠 Analyzing narratives...

============================================================
🚨 NARRATIVES DETECTED!
============================================================

📌 Dog Meme Revival
   Matches: 5 tokens
   Tokens: BONK, WIF, SHIB, INU, DOGE
   Reason: Dog memes heating up - BONK/WIF vibes detected! 🐕

⛓️  Creating reactive token on devnet...

✅ TOKEN CREATED SUCCESSFULLY!
────────────────────────────────────────────────────────────
   Token Name:    DogMemeRevival2026
   Symbol:        DOG26
   Mint Address:  8xK...abc
   TX Signature:  5abc...xyz
   Explorer:      https://solscan.io/tx/5abc...xyz?cluster=devnet
────────────────────────────────────────────────────────────
```

---

## 🧰 Tech Stack

| Technology | Purpose |
|------------|---------|
| [TypeScript](https://www.typescriptlang.org/) | Type-safe application logic |
| [@solana/web3.js](https://solana-labs.github.io/solana-web3.js/) | Solana blockchain interaction |
| [@solana/spl-token](https://spl.solana.com/token) | SPL token creation & management |
| [Axios](https://axios-http.com/) | HTTP client for DexScreener API |
| [bs58](https://www.npmjs.com/package/bs58) | Base58 encoding/decoding for keys |
| [dotenv](https://www.npmjs.com/package/dotenv) | Environment variable management |
| [tsx](https://tsx.is/) | TypeScript execution without build step |

---

## 🛡️ Safety & Disclaimer

> **⚠️ This project operates exclusively on Solana Devnet.**

- ✅ All transactions use **test SOL** — no real funds are at risk
- ✅ DexScreener API is **public and read-only** — no authentication required
- ✅ Created tokens exist **only on devnet** and have no monetary value
- ❌ Do **NOT** use this with mainnet private keys

---

## 🗺️ Roadmap

- [ ] Add more narrative themes with community-driven keywords
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
  Built with ❤️ on Solana
</p>
