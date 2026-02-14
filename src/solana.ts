import {
    Connection,
    Keypair,
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
} from "@solana/spl-token";

export async function createSplToken(
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
