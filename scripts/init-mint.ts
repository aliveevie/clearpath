import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  PublicKey,
} from "@solana/web3.js";
import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializeTransferHookInstruction,
  getMintLen,
  createMintToInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import fs from "fs";

// --- Configuration ---
const DECIMALS = 6;

async function main() {
  // Load wallet
  const walletPath =
    process.env.WALLET_PATH || `${process.env.HOME}/.config/solana/id.json`;
  const secretKey = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  const payer = Keypair.fromSecretKey(Uint8Array.from(secretKey));

  const rpcUrl = process.env.RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");

  // Load program IDs from Anchor.toml context
  const anchorToml = fs.readFileSync("Anchor.toml", "utf-8");
  const hookProgramIdMatch = anchorToml.match(
    /clearpath_hook\s*=\s*"([^"]+)"/
  );
  if (!hookProgramIdMatch) throw new Error("Hook program ID not found in Anchor.toml");
  const hookProgramId = new PublicKey(hookProgramIdMatch[1]);

  console.log("=== ClearPath Mint Initialization ===");
  console.log(`Payer: ${payer.publicKey.toBase58()}`);
  console.log(`Hook Program: ${hookProgramId.toBase58()}`);
  console.log(`RPC: ${rpcUrl}`);

  // Check balance
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`Balance: ${balance / 1e9} SOL`);
  if (balance < 0.1 * 1e9) {
    console.log("Insufficient balance. Requesting airdrop...");

    let funded = false;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const sig = await connection.requestAirdrop(payer.publicKey, 1 * 1e9);
        const latestBlockhash = await connection.getLatestBlockhash();
        await connection.confirmTransaction(
          {
            signature: sig,
            ...latestBlockhash,
          },
          "confirmed"
        );

        funded = true;
        console.log(`Airdrop confirmed on attempt ${attempt}.`);
        break;
      } catch (error) {
        console.warn(`Airdrop attempt ${attempt} failed:`, error);
      }
    }

    if (!funded) {
      throw new Error(
        "Unable to fund payer wallet automatically. Fund the wallet manually or set WALLET_PATH to a funded keypair."
      );
    }
  }

  // Generate mint keypair
  const mint = Keypair.generate();
  console.log(`\nMint Address: ${mint.publicKey.toBase58()}`);

  // Calculate mint account size with TransferHook extension
  const extensions = [ExtensionType.TransferHook];
  const mintLen = getMintLen(extensions);
  const mintLamports = await connection.getMinimumBalanceForRentExemption(
    mintLen
  );

  // Build transaction to create mint with TransferHook extension
  const tx = new Transaction().add(
    // 1. Create account for mint
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports: mintLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    // 2. Initialize TransferHook extension — points to our compliance hook program
    createInitializeTransferHookInstruction(
      mint.publicKey,
      payer.publicKey, // authority
      hookProgramId, // transfer hook program ID
      TOKEN_2022_PROGRAM_ID
    ),
    // 3. Initialize the mint itself
    createInitializeMintInstruction(
      mint.publicKey,
      DECIMALS,
      payer.publicKey, // mint authority
      null, // freeze authority
      TOKEN_2022_PROGRAM_ID
    )
  );

  const sig = await sendAndConfirmTransaction(connection, tx, [payer, mint]);
  console.log(`Mint created! Tx: ${sig}`);

  // Initialize ExtraAccountMetas PDA for the hook program
  console.log("\nInitializing ExtraAccountMetas PDA...");

  // Derive the extra account metas PDA
  const [extraAccountMetasPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), mint.publicKey.toBuffer()],
    hookProgramId
  );
  console.log(`ExtraAccountMetas PDA: ${extraAccountMetasPda.toBase58()}`);

  // Load hook program IDL and initialize
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(payer),
    { commitment: "confirmed" }
  );
  const idl = JSON.parse(
    fs.readFileSync("target/idl/clearpath_hook.json", "utf-8")
  );
  const hookProgram = new anchor.Program(idl, provider);

  const initMetasTx = await hookProgram.methods
    .initializeExtraAccountMetas()
    .accountsPartial({
      extraAccountMetas: extraAccountMetasPda,
      mint: mint.publicKey,
      payer: payer.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log(`ExtraAccountMetas initialized! Tx: ${initMetasTx}`);

  // Create an Associated Token Account for the payer
  const payerAta = getAssociatedTokenAddressSync(
    mint.publicKey,
    payer.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const createAtaTx = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      payer.publicKey,
      payerAta,
      payer.publicKey,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );
  const ataSignature = await sendAndConfirmTransaction(connection, createAtaTx, [payer]);
  console.log(`\nPayer ATA created: ${payerAta.toBase58()}`);

  // Mint initial supply (1,000,000 USDC)
  const mintAmount = 1_000_000 * 10 ** DECIMALS;
  const mintToTx = new Transaction().add(
    createMintToInstruction(
      mint.publicKey,
      payerAta,
      payer.publicKey,
      mintAmount,
      [],
      TOKEN_2022_PROGRAM_ID
    )
  );
  const mintToSig = await sendAndConfirmTransaction(connection, mintToTx, [
    payer,
  ]);
  console.log(
    `Minted ${mintAmount / 10 ** DECIMALS} ClearPath USDC to ${payerAta.toBase58()}`
  );
  console.log(`Tx: ${mintToSig}`);

  // Output summary
  console.log("\n=== Summary ===");
  console.log(`Mint:                  ${mint.publicKey.toBase58()}`);
  console.log(`Hook Program:          ${hookProgramId.toBase58()}`);
  console.log(`ExtraAccountMetas PDA: ${extraAccountMetasPda.toBase58()}`);
  console.log(`Payer ATA:             ${payerAta.toBase58()}`);
  console.log(`Initial Supply:        ${mintAmount / 10 ** DECIMALS} USDC`);

  // Save mint info for other scripts
  const mintInfo = {
    mint: mint.publicKey.toBase58(),
    hookProgramId: hookProgramId.toBase58(),
    extraAccountMetasPda: extraAccountMetasPda.toBase58(),
    payerAta: payerAta.toBase58(),
    decimals: DECIMALS,
  };
  fs.writeFileSync("mint-info.json", JSON.stringify(mintInfo, null, 2));
  console.log("\nMint info saved to mint-info.json");
}

main().catch(console.error);
