import { Router, Request, Response } from "express";
import { processKycWebhook, KycWebhookPayload } from "../services/kyc";
import { verifyWebhookSignature } from "../middleware/auth";
import { getHookProgram, getWhitelistPda } from "../services/solana";
import { PublicKey } from "@solana/web3.js";
import {
  ensureDemoWhitelistEntry,
  getDemoWhitelistEntry,
} from "../services/demo-store";

const router = Router();

/**
 * POST /webhooks/kyc
 * Receives KYC verification results from provider (Sumsub/Synaps).
 * Updates on-chain whitelist accordingly.
 */
router.post(
  "/webhooks/kyc",
  verifyWebhookSignature,
  async (req: Request, res: Response) => {
    try {
      const payload: KycWebhookPayload = req.body;

      if (!payload.wallet || !payload.status || !payload.tier || !payload.region) {
        return res.status(400).json({
          error: "Missing required fields: wallet, status, tier, region",
        });
      }

      let result;
      try {
        result = await processKycWebhook(payload);
      } catch {
        const demoEntry =
          payload.status === "approved"
            ? ensureDemoWhitelistEntry(payload.wallet, {
                kycTier: payload.tier,
                regionCode: payload.region,
                isSanctioned: false,
              })
            : ensureDemoWhitelistEntry(payload.wallet, {
                kycTier: payload.tier,
                regionCode: payload.region,
                isSanctioned: true,
              });

        result = {
          tx: "demo-mode",
          whitelistAddress: demoEntry.address,
          mode: "demo",
        };
      }
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("KYC webhook error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * GET /kyc/:wallet
 * Check whitelist status for a wallet.
 */
router.get("/:wallet", async (req: Request, res: Response) => {
  try {
    const walletPubkey = new PublicKey(req.params.wallet);
    const [whitelistPda] = getWhitelistPda(walletPubkey);
    const hookProgram = getHookProgram();
    const hookAccounts = hookProgram.account as any;

    const entry = await hookAccounts.whitelistEntry
      .fetchNullable(whitelistPda)
      .catch(() => null);

    if (!entry) {
      const demoEntry = getDemoWhitelistEntry(req.params.wallet);
      if (demoEntry) {
        return res.json({
          whitelisted: true,
          wallet: req.params.wallet,
          kycTier: demoEntry.kycTier,
          kycExpiry: demoEntry.kycExpiry,
          regionCode: demoEntry.regionCode,
          isSanctioned: demoEntry.isSanctioned,
          mode: demoEntry.mode,
        });
      }
      return res.json({ whitelisted: false, wallet: req.params.wallet });
    }

    res.json({
      whitelisted: true,
      wallet: req.params.wallet,
      kycTier: entry.kycTier,
      kycExpiry: (entry.kycExpiry as any).toNumber(),
      regionCode: Buffer.from(entry.regionCode as number[]).toString("utf-8"),
      isSanctioned: entry.isSanctioned,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
