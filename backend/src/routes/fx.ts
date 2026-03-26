import { Router, Request, Response } from "express";
import {
  getCachedRate,
  getAllCachedRates,
  pushFxRateOnChain,
  fetchFxRates,
} from "../services/fx-adapter";
import { requireAdmin } from "../middleware/auth";
import { buildTransferTransaction } from "../services/live-transfer";

const router = Router();

/**
 * GET /fx
 * Get all cached FX rates.
 */
router.get("/", (_req: Request, res: Response) => {
  const rates = getAllCachedRates();
  res.json({
    rates: rates.map((r) => ({
      pair: r.pair,
      rate: r.rate / 1_000_000,
      rateRaw: r.rate,
      lastUpdated: new Date(r.timestamp).toISOString(),
    })),
  });
});

/**
 * GET /fx/:pair
 * Get FX rate for a specific currency pair.
 */
router.get("/:pair", (req: Request, res: Response) => {
  const pair = req.params.pair.toUpperCase();
  const rate = getCachedRate(pair);

  if (!rate) {
    return res.status(404).json({ error: `No rate found for ${pair}` });
  }

  res.json({
    pair: rate.pair,
    rate: rate.rate / 1_000_000,
    rateRaw: rate.rate,
    lastUpdated: new Date(rate.timestamp).toISOString(),
  });
});

/**
 * POST /fx/update
 * Manually trigger FX rate refresh and on-chain push.
 */
router.post("/update", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rates = await fetchFxRates();
    const results = [];

    for (const rate of rates) {
      const result = await pushFxRateOnChain(rate.pair, rate.rate);
      results.push(result);
    }

    res.json({ success: true, results });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /fx/settle
 * Build an FX settlement transaction for wallet signing.
 * Converts USDC to target currency at on-chain rate.
 */
router.post("/settle", async (req: Request, res: Response) => {
  try {
    const { senderWallet, recipientWallet, amount, targetCurrency } = req.body;

    if (!senderWallet || !amount || !targetCurrency) {
      return res.status(400).json({
        error: "Missing required fields: senderWallet, amount, targetCurrency",
      });
    }

    const pair = `USD${targetCurrency}`;
    const rate = getCachedRate(pair);
    if (!rate) {
      return res.status(404).json({ error: `No FX rate found for ${pair}` });
    }

    const settledAmount = (Number(amount) * rate.rate) / 1_000_000;
    const recipient = recipientWallet || senderWallet;

    // Build the transfer transaction (compliance-checked)
    const result = await buildTransferTransaction({
      senderWallet,
      recipientWallet: recipient,
      amount: Number(amount),
      targetCurrency,
    });

    return res.json({
      success: true,
      transaction: result.serializedTransaction,
      usdcAmount: Number(amount),
      settledAmount: Math.round(settledAmount * 100) / 100,
      targetCurrency,
      rate: rate.rate / 1_000_000,
      pair,
      travelRuleApplies: result.travelRuleApplies,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
