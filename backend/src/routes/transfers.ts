import { Router, Request, Response } from "express";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import fs from "fs";
import path from "path";
import { recordDemoTransfer } from "../services/demo-store";
import { submitLiveTransfer, buildTransferTransaction } from "../services/live-transfer";
import { getHookProgram, getTravelRulePda } from "../services/solana";
import { adminKeypair } from "../config";

const router = Router();

const TRAVEL_RULE_THRESHOLD = 1_000; // USDC

// Persistent transfer ledger
interface TransferEntry {
  signature?: string;
  sender: string;
  recipient: string;
  amount: number;
  targetCurrency: string;
  timestamp: number;
  status: "pending" | "confirmed" | "failed";
  travelRuleRecorded?: boolean;
}

const LEDGER_PATH = path.join(__dirname, "../../.transfer-ledger.json");

function loadLedger(): TransferEntry[] {
  try {
    return JSON.parse(fs.readFileSync(LEDGER_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function saveLedger(ledger: TransferEntry[]) {
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
}

const transferLedger: TransferEntry[] = loadLedger();

// Build a transaction for the user's wallet to sign
router.post("/build", async (req: Request, res: Response) => {
  try {
    const { senderWallet, recipientWallet, amount, targetCurrency } = req.body;

    if (!senderWallet || !recipientWallet || !amount || !targetCurrency) {
      return res.status(400).json({
        error:
          "Missing required fields: senderWallet, recipientWallet, amount, targetCurrency",
      });
    }

    new PublicKey(senderWallet);
    new PublicKey(recipientWallet);

    const amountValue = Number(amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      return res.status(400).json({ error: "Amount must be greater than zero." });
    }

    if (senderWallet === recipientWallet) {
      return res.status(400).json({ error: "Cannot transfer to yourself." });
    }

    const result = await buildTransferTransaction({
      senderWallet,
      recipientWallet,
      amount: amountValue,
      targetCurrency,
    });

    // Record pending transfer
    transferLedger.unshift({
      sender: senderWallet,
      recipient: recipientWallet,
      amount: amountValue,
      targetCurrency,
      timestamp: Date.now(),
      status: "pending",
    });
    saveLedger(transferLedger);

    return res.json({
      success: true,
      transaction: result.serializedTransaction,
      amountRaw: result.amountRaw,
      travelRuleApplies: result.travelRuleApplies,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Legacy server-side submit (kept for demo/fallback)
router.post("/submit", async (req: Request, res: Response) => {
  try {
    const { senderWallet, recipientWallet, amount, targetCurrency } = req.body;

    if (!senderWallet || !recipientWallet || !amount || !targetCurrency) {
      return res.status(400).json({
        error:
          "Missing required fields: senderWallet, recipientWallet, amount, targetCurrency",
      });
    }

    new PublicKey(senderWallet);
    new PublicKey(recipientWallet);

    const amountValue = Number(amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      return res.status(400).json({ error: "Amount must be greater than zero." });
    }

    try {
      const result = await submitLiveTransfer({
        recipientWallet,
        amount: amountValue,
        targetCurrency,
      });

      return res.json({
        success: true,
        mode: result.mode,
        signature: result.signature,
        amount: amountValue,
        targetCurrency,
        travelRuleRecorded: result.travelRuleRecorded,
        message: result.travelRuleRecorded
          ? `Live transfer confirmed on-chain. Travel Rule record should now exist for ${amountValue} USDC.`
          : `Live transfer confirmed on-chain for ${amountValue} USDC.`,
      });
    } catch (liveError) {
      const result = recordDemoTransfer({
        senderWallet,
        recipientWallet,
        amountRaw: Math.round(amountValue * 1_000_000),
        targetCurrency,
      });

      return res.json({
        success: true,
        mode: result.mode,
        transferId: result.transferId,
        amount: amountValue,
        targetCurrency,
        travelRuleRecorded: Boolean(result.travelRuleRecord),
        message: result.travelRuleRecord
          ? `Demo transfer submitted. Travel Rule record created for ${amountValue} USDC.`
          : `Demo transfer submitted for ${amountValue} USDC.`,
        warning:
          liveError instanceof Error ? liveError.message : "Live transfer unavailable.",
      });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /transfers/confirm
 * Called by the frontend after wallet signs and confirms the tx.
 */
router.post("/confirm", async (req: Request, res: Response) => {
  try {
    const { signature, sender } = req.body;
    // Find the most recent pending transfer for this sender and mark it confirmed
    const entry = transferLedger.find(
      (t) => t.sender === sender && t.status === "pending"
    );
    if (entry) {
      entry.signature = signature;
      entry.status = "confirmed";
      saveLedger(transferLedger);

      // Record Travel Rule on-chain if above threshold
      if (entry.amount >= TRAVEL_RULE_THRESHOLD) {
        try {
          const hookProgram = getHookProgram();
          const txSigBytes = Buffer.alloc(64);
          Buffer.from(signature, "base64").copy(txSigBytes, 0, 0, 64);
          const txSigArray = Array.from(txSigBytes) as unknown as number[];

          const amountRaw = Math.round(entry.amount * 1_000_000);
          const currencyPair = `USD${entry.targetCurrency}`;
          const pairBytes = Array.from(
            Buffer.from(currencyPair.padEnd(6, "\0"))
          ) as unknown as number[];

          // Simple encrypted payload (AES-256 placeholder with structured data)
          const payloadData = JSON.stringify({
            sender: entry.sender,
            recipient: entry.recipient,
            amount: entry.amount,
            currency: entry.targetCurrency,
            timestamp: entry.timestamp,
          });
          const encryptedPayload = Buffer.alloc(256);
          Buffer.from(payloadData).copy(encryptedPayload, 0, 0, Math.min(payloadData.length, 256));
          const payloadArray = Array.from(encryptedPayload) as unknown as number[];

          const senderPubkey = new PublicKey(entry.sender);
          const recipientPubkey = new PublicKey(entry.recipient);

          const [travelRulePda] = getTravelRulePda(txSigBytes);

          await hookProgram.methods
            .recordTravelRule(
              txSigArray,
              new BN(amountRaw),
              pairBytes,
              senderPubkey,
              recipientPubkey,
              payloadArray
            )
            .accountsPartial({
              travelRuleRecord: travelRulePda,
              authority: adminKeypair.publicKey,
              systemProgram: SystemProgram.programId,
            })
            .rpc();

          entry.travelRuleRecorded = true;
          saveLedger(transferLedger);
        } catch (trErr: any) {
          console.error("Travel Rule recording failed:", trErr.message);
          // Non-blocking: transfer still succeeded
        }
      }
    }
    res.json({
      success: true,
      travelRuleRecorded: entry?.travelRuleRecorded || false,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /transfers/history/:wallet
 * Return transfer history from the local ledger.
 */
router.get("/history/:wallet", async (req: Request, res: Response) => {
  try {
    const wallet = req.params.wallet;
    const transfers = transferLedger
      .filter(
        (t) =>
          (t.sender === wallet || t.recipient === wallet) &&
          t.status === "confirmed"
      )
      .map((t) => ({
        signature: t.signature,
        timestamp: t.timestamp,
        amount: t.amount,
        targetCurrency: t.targetCurrency,
        type: t.sender === wallet ? "sent" : "received",
        counterparty: t.sender === wallet ? t.recipient : t.sender,
      }));

    res.json({ transfers });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
