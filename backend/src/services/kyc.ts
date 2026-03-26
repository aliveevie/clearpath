import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { getHookProgram, getWhitelistPda } from "./solana";
import { adminKeypair } from "../config";

export interface KycWebhookPayload {
  wallet: string;
  status: "approved" | "rejected" | "sanctioned";
  tier: number;
  region: string;
  expiryDays?: number;
}

export async function processKycWebhook(payload: KycWebhookPayload) {
  const hookProgram = getHookProgram();
  const hookAccounts = hookProgram.account as any;
  const walletPubkey = new PublicKey(payload.wallet);
  const [whitelistPda] = getWhitelistPda(walletPubkey);

  const regionBytes = Buffer.alloc(2);
  regionBytes.write(payload.region.substring(0, 2));

  const expiryDays = payload.expiryDays || 365;
  const kycExpiry = Math.floor(Date.now() / 1000) + expiryDays * 24 * 60 * 60;

  if (payload.status === "approved") {
    // Check if entry already exists
    const existing = await hookAccounts.whitelistEntry
      .fetchNullable(whitelistPda)
      .catch(() => null);

    if (existing) {
      // Update existing entry
      const tx = await hookProgram.methods
        .updateWhitelist(
          payload.tier,
          new BN(kycExpiry),
          Array.from(regionBytes) as unknown as number[],
          false
        )
        .accountsPartial({
          whitelistEntry: whitelistPda,
          authority: adminKeypair.publicKey,
        })
        .rpc();

      return { action: "updated", tx, wallet: payload.wallet };
    } else {
      // Add new entry
      const tx = await hookProgram.methods
        .addToWhitelist(
          payload.tier,
          new BN(kycExpiry),
          Array.from(regionBytes) as unknown as number[]
        )
        .accountsPartial({
          wallet: walletPubkey,
          authority: adminKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      return { action: "added", tx, wallet: payload.wallet };
    }
  } else if (
    payload.status === "rejected" ||
    payload.status === "sanctioned"
  ) {
    const existing = await hookAccounts.whitelistEntry
      .fetchNullable(whitelistPda)
      .catch(() => null);

    if (existing) {
      const tx = await hookProgram.methods
        .updateWhitelist(
          payload.tier,
          new BN(kycExpiry),
          Array.from(regionBytes) as unknown as number[],
          payload.status === "sanctioned"
        )
        .accountsPartial({
          whitelistEntry: whitelistPda,
          authority: adminKeypair.publicKey,
        })
        .rpc();

      return {
        action: payload.status === "sanctioned" ? "sanctioned" : "rejected",
        tx,
        wallet: payload.wallet,
      };
    }

    return { action: "no_entry", wallet: payload.wallet };
  }

  throw new Error(`Unknown KYC status: ${payload.status}`);
}
