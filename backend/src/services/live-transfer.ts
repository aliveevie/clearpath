import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import fs from "fs";
import path from "path";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createTransferCheckedWithTransferHookInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { adminKeypair, connection } from "../config";
import { getFxConfigPda, getHookProgram, getWhitelistPda } from "./solana";
import { getCachedRate } from "./fx-adapter";

const TRAVEL_RULE_THRESHOLD_RAW = 1_000 * 1_000_000;
const mintInfoPath = path.join(__dirname, "../../../mint-info.json");

interface MintInfo {
  mint: string;
  hookProgramId: string;
  extraAccountMetasPda: string;
  payerAta: string;
  decimals: number;
}

function currencyToRegion(targetCurrency: string) {
  switch (targetCurrency) {
    case "CHF":
      return "CH";
    case "EUR":
      return "DE";
    case "GBP":
      return "GB";
    default:
      return "US";
  }
}

function currencyToPair(targetCurrency: string) {
  return `USD${targetCurrency}`;
}

function loadMintInfo(): MintInfo | null {
  if (!fs.existsSync(mintInfoPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(mintInfoPath, "utf8")) as MintInfo;
}

async function ensureWhitelistEntry(
  hookProgram: anchor.Program,
  wallet: PublicKey,
  regionCode: string,
  kycTier: number
) {
  const hookAccounts = hookProgram.account as any;
  const [whitelistPda] = getWhitelistPda(wallet);
  const existing = await hookAccounts.whitelistEntry
    .fetchNullable(whitelistPda)
    .catch(() => null);
  const kycExpiry = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
  const regionBytes = Array.from(
    Buffer.from(regionCode.padEnd(2, " ").slice(0, 2))
  ) as unknown as number[];

  if (existing) {
    await hookProgram.methods
      .updateWhitelist(kycTier, new BN(kycExpiry), regionBytes, false)
      .accountsPartial({
        whitelistEntry: whitelistPda,
        authority: adminKeypair.publicKey,
      })
      .rpc();
    return whitelistPda;
  }

  await hookProgram.methods
    .addToWhitelist(kycTier, new BN(kycExpiry), regionBytes)
    .accountsPartial({
      whitelistEntry: whitelistPda,
      wallet,
      authority: adminKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return whitelistPda;
}

async function ensureFxConfig(
  hookProgram: anchor.Program,
  currencyPair: string,
  rateRaw: number
) {
  const hookAccounts = hookProgram.account as any;
  const [fxConfigPda] = getFxConfigPda(currencyPair);
  const existing = await hookAccounts.fxConfig
    .fetchNullable(fxConfigPda)
    .catch(() => null);
  const pairBytes = Array.from(
    Buffer.from(currencyPair.padEnd(6, "\0"))
  ) as unknown as number[];

  if (existing) {
    await hookProgram.methods
      .updateFxRate(new BN(rateRaw))
      .accountsPartial({
        fxConfig: fxConfigPda,
        authority: adminKeypair.publicKey,
      })
      .rpc();
    return fxConfigPda;
  }

  await hookProgram.methods
    .initFxConfig(pairBytes, new BN(rateRaw))
    .accountsPartial({
      fxConfig: fxConfigPda,
      authority: adminKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return fxConfigPda;
}

async function ensureRecipientAta(
  mint: PublicKey,
  recipient: PublicKey
): Promise<PublicKey> {
  const recipientAta = getAssociatedTokenAddressSync(
    mint,
    recipient,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const existing = await connection.getAccountInfo(recipientAta);
  if (!existing) {
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        adminKeypair.publicKey,
        recipientAta,
        recipient,
        mint,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
    await sendAndConfirmTransaction(connection, tx, [adminKeypair], {
      commitment: "confirmed",
    });
  }

  return recipientAta;
}

/**
 * Build a transaction that the user's wallet will sign.
 * The backend handles admin-only setup (whitelist, FX, ATA creation),
 * then returns a serialized transaction for the user to sign & send.
 */
export async function buildTransferTransaction(input: {
  senderWallet: string;
  recipientWallet: string;
  amount: number;
  targetCurrency: string;
}) {
  const mintInfo = loadMintInfo();
  if (!mintInfo) {
    throw new Error("mint-info.json not found. Initialize the devnet mint first.");
  }

  const mint = new PublicKey(mintInfo.mint);
  const sender = new PublicKey(input.senderWallet);
  const recipient = new PublicKey(input.recipientWallet);
  const amountRaw = Math.round(input.amount * 10 ** mintInfo.decimals);

  const mintAccount = await connection.getAccountInfo(mint);
  if (!mintAccount) {
    throw new Error(`Mint ${mint.toBase58()} was not found on the current RPC.`);
  }

  // Admin-only operations: ensure whitelist entries & FX config
  const hookProgram = getHookProgram();
  await ensureWhitelistEntry(hookProgram, sender, "NG", 2);
  await ensureWhitelistEntry(
    hookProgram,
    recipient,
    currencyToRegion(input.targetCurrency),
    1
  );
  const fxPair = currencyToPair(input.targetCurrency);
  const cachedRate = getCachedRate(fxPair);
  const fxRate = cachedRate ? cachedRate.rate : 883_450;
  await ensureFxConfig(hookProgram, fxPair, fxRate);

  // Ensure recipient has an ATA (admin pays for creation)
  const recipientAta = await ensureRecipientAta(mint, recipient);

  // Ensure sender has an ATA with tokens (for demo: mint tokens if needed)
  const senderAta = getAssociatedTokenAddressSync(
    mint,
    sender,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const senderAtaInfo = await connection.getAccountInfo(senderAta);
  if (!senderAtaInfo) {
    // First time: create sender ATA and mint initial demo tokens
    const setupTx = new Transaction()
      .add(
        createAssociatedTokenAccountInstruction(
          adminKeypair.publicKey,
          senderAta,
          sender,
          mint,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      )
      .add(
        createMintToInstruction(
          mint,
          senderAta,
          adminKeypair.publicKey,
          10_000 * 10 ** mintInfo.decimals, // 10k initial demo USDC
          [],
          TOKEN_2022_PROGRAM_ID
        )
      );
    await sendAndConfirmTransaction(connection, setupTx, [adminKeypair], {
      commitment: "confirmed",
    });
  }

  // Build the transfer instruction with the SENDER as authority
  const transferIx = await createTransferCheckedWithTransferHookInstruction(
    connection as Connection,
    senderAta,
    mint,
    recipientAta,
    sender, // user's wallet is the authority
    BigInt(amountRaw),
    mintInfo.decimals,
    [],
    "confirmed",
    TOKEN_2022_PROGRAM_ID
  );

  const tx = new Transaction().add(transferIx);
  tx.feePayer = sender;
  tx.recentBlockhash = (
    await connection.getLatestBlockhash("confirmed")
  ).blockhash;

  // Serialize for the frontend — the user's wallet will sign this
  const serializedTransaction = Buffer.from(
    tx.serialize({ requireAllSignatures: false })
  ).toString("base64");

  return {
    serializedTransaction,
    amountRaw,
    travelRuleApplies: amountRaw >= TRAVEL_RULE_THRESHOLD_RAW,
  };
}

export async function submitLiveTransfer(input: {
  recipientWallet: string;
  amount: number;
  targetCurrency: string;
}) {
  const mintInfo = loadMintInfo();
  if (!mintInfo) {
    throw new Error("mint-info.json not found. Initialize the devnet mint first.");
  }

  const mint = new PublicKey(mintInfo.mint);
  const senderAta = new PublicKey(mintInfo.payerAta);
  const recipient = new PublicKey(input.recipientWallet);
  const amountRaw = Math.round(input.amount * 10 ** mintInfo.decimals);

  const mintAccount = await connection.getAccountInfo(mint);
  if (!mintAccount) {
    throw new Error(`Mint ${mint.toBase58()} was not found on the current RPC.`);
  }

  const senderAtaAccount = await connection.getAccountInfo(senderAta);
  if (!senderAtaAccount) {
    throw new Error(
      `Sender token account ${senderAta.toBase58()} was not found on the current RPC.`
    );
  }

  const hookProgram = getHookProgram();
  await ensureWhitelistEntry(
    hookProgram,
    adminKeypair.publicKey,
    "NG",
    2
  );
  await ensureWhitelistEntry(
    hookProgram,
    recipient,
    currencyToRegion(input.targetCurrency),
    1
  );
  const fxPair2 = currencyToPair(input.targetCurrency);
  const cachedRate2 = getCachedRate(fxPair2);
  const fxRate2 = cachedRate2 ? cachedRate2.rate : 883_450;
  await ensureFxConfig(hookProgram, fxPair2, fxRate2);

  const recipientAta = await ensureRecipientAta(mint, recipient);
  const transferIx = await createTransferCheckedWithTransferHookInstruction(
    connection as Connection,
    senderAta,
    mint,
    recipientAta,
    adminKeypair.publicKey,
    BigInt(amountRaw),
    mintInfo.decimals,
    [],
    "confirmed",
    TOKEN_2022_PROGRAM_ID
  );

  const tx = new Transaction().add(transferIx);
  const signature = await sendAndConfirmTransaction(connection, tx, [adminKeypair], {
    commitment: "confirmed",
  });

  return {
    signature,
    amountRaw,
    travelRuleRecorded: amountRaw >= TRAVEL_RULE_THRESHOLD_RAW,
    mode: "live" as const,
  };
}
