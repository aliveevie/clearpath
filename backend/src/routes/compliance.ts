import { Router, Request, Response } from "express";
import {
  getTravelRuleRecord,
  getAllTravelRuleRecords,
} from "../services/travel-rule";
import { getHookProgram, getWhitelistPda } from "../services/solana";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import { adminKeypair } from "../config";
import {
  listDemoTravelRuleRecords,
  listDemoWhitelistEntries,
} from "../services/demo-store";

const router = Router();

function mergeWhitelistEntries(onChainEntries: any[], demoEntries: any[]) {
  const merged = new Map<string, any>();
  for (const entry of onChainEntries) {
    merged.set(entry.wallet, entry);
  }
  for (const entry of demoEntries) {
    if (!merged.has(entry.wallet)) {
      merged.set(entry.wallet, entry);
    }
  }
  return Array.from(merged.values());
}

function mergeTravelRuleRecords(onChainRecords: any[], demoRecords: any[]) {
  const merged = new Map<string, any>();
  for (const record of onChainRecords) {
    merged.set(record.address, record);
  }
  for (const record of demoRecords) {
    if (!merged.has(record.address)) {
      merged.set(record.address, record);
    }
  }
  return Array.from(merged.values()).sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * GET /compliance/travel-rules
 * List all Travel Rule records.
 */
router.get("/travel-rules", async (_req: Request, res: Response) => {
  try {
    const records = mergeTravelRuleRecords(
      await getAllTravelRuleRecords(),
      listDemoTravelRuleRecords()
    );
    res.json({ records });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /compliance/whitelist
 * List all whitelist entries.
 */
router.get("/whitelist", async (_req: Request, res: Response) => {
  try {
    const hookProgram = getHookProgram();
    const hookAccounts = hookProgram.account as any;
    const entries = await hookAccounts.whitelistEntry.all().catch(() => []);
    const onChainEntries = entries.map((e: any) => ({
      address: e.publicKey.toBase58(),
      wallet: (e.account.wallet as PublicKey).toBase58(),
      kycTier: e.account.kycTier,
      kycExpiry: (e.account.kycExpiry as any).toNumber(),
      regionCode: Buffer.from(e.account.regionCode as number[]).toString(
        "utf-8"
      ),
      isSanctioned: e.account.isSanctioned,
    }));

    res.json({
      entries: mergeWhitelistEntries(onChainEntries, listDemoWhitelistEntries()),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /compliance/stats
 * Compliance dashboard statistics.
 */
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const hookProgram = getHookProgram();
    const hookAccounts = hookProgram.account as any;
    const whitelistEntries = mergeWhitelistEntries(
      (
        await hookAccounts.whitelistEntry.all().catch(() => [])
      ).map((e: any) => ({
        address: e.publicKey.toBase58(),
        wallet: (e.account.wallet as PublicKey).toBase58(),
        kycTier: e.account.kycTier,
        kycExpiry: (e.account.kycExpiry as any).toNumber(),
        regionCode: Buffer.from(e.account.regionCode as number[]).toString(
          "utf-8"
        ),
        isSanctioned: e.account.isSanctioned,
      })),
      listDemoWhitelistEntries()
    );
    const travelRuleRecords = mergeTravelRuleRecords(
      await getAllTravelRuleRecords(),
      listDemoTravelRuleRecords()
    );

    const totalWhitelisted = whitelistEntries.length;
    const sanctionedCount = whitelistEntries.filter(
      (e: any) => e.isSanctioned
    ).length;
    const expiredCount = whitelistEntries.filter(
      (e: any) => e.kycExpiry < Math.floor(Date.now() / 1000)
    ).length;

    const regionBreakdown: Record<string, number> = {};
    for (const entry of whitelistEntries) {
      const region = entry.regionCode;
      regionBreakdown[region] = (regionBreakdown[region] || 0) + 1;
    }

    res.json({
      totalWhitelisted,
      activeWhitelisted: totalWhitelisted - sanctionedCount - expiredCount,
      sanctionedCount,
      expiredCount,
      totalTravelRuleRecords: travelRuleRecords.length,
      regionBreakdown,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /compliance/whitelist
 * Add or update a KYC whitelist entry on-chain.
 */
router.post("/whitelist", async (req: Request, res: Response) => {
  try {
    const { wallet, kycTier, regionCode, isSanctioned } = req.body;

    if (!wallet || kycTier === undefined || !regionCode) {
      return res.status(400).json({
        error: "Missing required fields: wallet, kycTier, regionCode",
      });
    }

    const walletPubkey = new PublicKey(wallet);
    const hookProgram = getHookProgram();
    const hookAccounts = hookProgram.account as any;
    const [whitelistPda] = getWhitelistPda(walletPubkey);
    const kycExpiry = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
    const regionBytes = Array.from(
      Buffer.from(regionCode.padEnd(2, " ").slice(0, 2))
    ) as unknown as number[];

    const existing = await hookAccounts.whitelistEntry
      .fetchNullable(whitelistPda)
      .catch(() => null);

    if (existing) {
      await hookProgram.methods
        .updateWhitelist(
          Number(kycTier),
          new BN(kycExpiry),
          regionBytes,
          Boolean(isSanctioned)
        )
        .accountsPartial({
          whitelistEntry: whitelistPda,
          authority: adminKeypair.publicKey,
        })
        .rpc();
    } else {
      await hookProgram.methods
        .addToWhitelist(Number(kycTier), new BN(kycExpiry), regionBytes)
        .accountsPartial({
          whitelistEntry: whitelistPda,
          wallet: walletPubkey,
          authority: adminKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    res.json({
      success: true,
      message: existing
        ? "KYC whitelist entry updated."
        : "Wallet added to KYC whitelist.",
      wallet,
      kycTier: Number(kycTier),
      regionCode,
      kycExpiry,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
