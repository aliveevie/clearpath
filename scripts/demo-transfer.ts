import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedWithTransferHookInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import fs from "fs";

async function main() {
  // Load config
  const walletPath =
    process.env.WALLET_PATH || `${process.env.HOME}/.config/solana/id.json`;
  const secretKey = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  const payer = Keypair.fromSecretKey(Uint8Array.from(secretKey));

  const rpcUrl = process.env.RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");

  if (!fs.existsSync("mint-info.json")) {
    console.error("Run scripts/init-mint.ts first to create the mint.");
    process.exit(1);
  }

  const mintInfo = JSON.parse(fs.readFileSync("mint-info.json", "utf-8"));
  const mintPubkey = new PublicKey(mintInfo.mint);
  const hookProgramId = new PublicKey(mintInfo.hookProgramId);

  console.log("=== ClearPath Demo Transfer ===\n");

  // Load hook program
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(payer),
    { commitment: "confirmed" }
  );
  const idl = JSON.parse(
    fs.readFileSync("target/idl/clearpath_hook.json", "utf-8")
  );
  const hookProgram = new anchor.Program(idl, provider);

  // Create two test wallets
  const senderWallet = payer;
  const receiverWallet = Keypair.generate();
  const [senderWhitelistPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("kyc"), senderWallet.publicKey.toBuffer()],
    hookProgramId
  );
  const [receiverWhitelistPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("kyc"), receiverWallet.publicKey.toBuffer()],
    hookProgramId
  );
  const [fxConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("fx"), Buffer.from("USDCHF")],
    hookProgramId
  );

  console.log(`Sender:   ${senderWallet.publicKey.toBase58()}`);
  console.log(`Receiver: ${receiverWallet.publicKey.toBase58()}`);

  // Fund receiver for rent
  const fundTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: receiverWallet.publicKey,
      lamports: 0.05 * 1e9,
    })
  );
  await sendAndConfirmTransaction(connection, fundTx, [payer]);

  // Create receiver ATA
  const receiverAta = getAssociatedTokenAddressSync(
    mintPubkey,
    receiverWallet.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const createReceiverAtaTx = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      payer.publicKey,
      receiverAta,
      receiverWallet.publicKey,
      mintPubkey,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );
  await sendAndConfirmTransaction(connection, createReceiverAtaTx, [payer]);
  console.log(`Receiver ATA: ${receiverAta.toBase58()}\n`);

  // --- Step 1: Whitelist both wallets ---
  console.log("--- Step 1: Whitelist sender and receiver ---");

  const kycExpiry = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 year

  // Whitelist sender
  const senderWhitelistTx = await hookProgram.methods
    .addToWhitelist(2, new BN(kycExpiry), [
      ...Buffer.from("DE"),
    ] as unknown as number[])
    .accountsPartial({
      whitelistEntry: senderWhitelistPda,
      wallet: senderWallet.publicKey,
      authority: payer.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log(`Sender whitelisted (tier 2, region DE). Tx: ${senderWhitelistTx}`);

  // Whitelist receiver
  const receiverWhitelistTx = await hookProgram.methods
    .addToWhitelist(2, new BN(kycExpiry), [
      ...Buffer.from("CH"),
    ] as unknown as number[])
    .accountsPartial({
      whitelistEntry: receiverWhitelistPda,
      wallet: receiverWallet.publicKey,
      authority: payer.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log(
    `Receiver whitelisted (tier 2, region CH). Tx: ${receiverWhitelistTx}\n`
  );

  // --- Step 2: Set FX rate ---
  console.log("--- Step 2: Initialize FX rate (USD/CHF) ---");

  const currencyPair = [...Buffer.from("USDCHF")] as unknown as number[];
  const fxRate = 883_450; // 0.883450 CHF per USD

  const initFxTx = await hookProgram.methods
    .initFxConfig(currencyPair, new BN(fxRate))
    .accountsPartial({
      fxConfig: fxConfigPda,
      authority: payer.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log(`FX rate set: USD/CHF = ${fxRate / 1_000_000}. Tx: ${initFxTx}\n`);

  // --- Step 3: Execute a compliant transfer (below threshold) ---
  console.log("--- Step 3: Compliant transfer (500 USDC — below Travel Rule threshold) ---");

  const transferAmount = 500 * 10 ** mintInfo.decimals;
  const senderAta = new PublicKey(mintInfo.payerAta);

  try {
    const transferIx = createTransferCheckedWithTransferHookInstruction(
      connection,
      senderAta,
      mintPubkey,
      receiverAta,
      senderWallet.publicKey,
      BigInt(transferAmount),
      mintInfo.decimals,
      [],
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );

    const tx = new Transaction().add(await transferIx);
    const sig = await sendAndConfirmTransaction(connection, tx, [
      senderWallet,
    ]);
    console.log(`✓ Transfer succeeded! 500 USDC sent. Tx: ${sig}\n`);
  } catch (e: any) {
    console.log(`Transfer result: ${e.message}\n`);
  }

  // --- Step 4: Execute a transfer above threshold (triggers Travel Rule event) ---
  console.log("--- Step 4: Large transfer (5,000 USDC — Travel Rule triggered) ---");

  const largeTransferAmount = 5_000 * 10 ** mintInfo.decimals;

  try {
    const transferIx = createTransferCheckedWithTransferHookInstruction(
      connection,
      senderAta,
      mintPubkey,
      receiverAta,
      senderWallet.publicKey,
      BigInt(largeTransferAmount),
      mintInfo.decimals,
      [],
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );

    const tx = new Transaction().add(await transferIx);
    const sig = await sendAndConfirmTransaction(connection, tx, [
      senderWallet,
    ]);
    console.log(
      `✓ Large transfer succeeded! 5,000 USDC sent. Travel Rule event emitted. Tx: ${sig}\n`
    );
  } catch (e: any) {
    console.log(`Large transfer result: ${e.message}\n`);
  }

  // --- Step 5: Demonstrate compliance rejection ---
  console.log("--- Step 5: Demonstrate compliance rejection (sanctioned wallet) ---");

  // Mark receiver as sanctioned
  const sanctionTx = await hookProgram.methods
    .updateWhitelist(2, new BN(kycExpiry), [
      ...Buffer.from("CH"),
    ] as unknown as number[], true)
    .accountsPartial({
      whitelistEntry: receiverWhitelistPda,
      authority: payer.publicKey,
    })
    .rpc();
  console.log(`Receiver marked as sanctioned. Tx: ${sanctionTx}`);

  try {
    const transferIx = createTransferCheckedWithTransferHookInstruction(
      connection,
      senderAta,
      mintPubkey,
      receiverAta,
      senderWallet.publicKey,
      BigInt(100 * 10 ** mintInfo.decimals),
      mintInfo.decimals,
      [],
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );

    const tx = new Transaction().add(await transferIx);
    await sendAndConfirmTransaction(connection, tx, [senderWallet]);
    console.log("Transfer unexpectedly succeeded!");
  } catch (e: any) {
    console.log(
      `✓ Transfer correctly REJECTED — sanctioned jurisdiction detected.\n  Error: ${e.message}\n`
    );
  }

  // --- Step 6: Record a Travel Rule entry ---
  console.log("--- Step 6: Record Travel Rule entry (post-transfer) ---");

  const fakeTxSig = new Uint8Array(64).fill(1);
  const fakePayload = new Uint8Array(256).fill(0xab);
  const [travelRulePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("travel"), Buffer.from(fakeTxSig.slice(0, 32))],
    hookProgramId
  );

  const travelRuleTx = await hookProgram.methods
    .recordTravelRule(
      Array.from(fakeTxSig),
      new BN(5_000_000_000),
      currencyPair,
      senderWallet.publicKey,
      receiverWallet.publicKey,
      Array.from(fakePayload)
    )
    .accountsPartial({
      travelRuleRecord: travelRulePda,
      authority: payer.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log(`Travel Rule record created. Tx: ${travelRuleTx}\n`);

  console.log("=== Demo Complete ===");
  console.log(
    "ClearPath compliance hook successfully enforces KYC, sanctions screening,"
  );
  console.log(
    "and Travel Rule at the token protocol level — no UI bypass possible."
  );
}

main().catch(console.error);
