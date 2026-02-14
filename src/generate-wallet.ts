import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import "dotenv/config";

const keypair = Keypair.generate();

console.log("🔑 NEW DEVNET WALLET GENERATED");
console.log("=".repeat(50));
console.log(`\n📝 Add this to your .env file:`);
console.log(`PRIVATE_KEY=${bs58.encode(keypair.secretKey)}`);
console.log(`\n🔍 Public Key (wallet address):`);
console.log(keypair.publicKey.toBase58());
console.log(`\n⚠️  IMPORTANT: Save the private key above!`);
console.log(`   You'll need it to sign transactions.`);
console.log(`\n💰 To fund, run:`);
console.log(`   solana airdrop 2 ${keypair.publicKey.toBase58()}`);
console.log(`   (Requires Solana CLI)`);
