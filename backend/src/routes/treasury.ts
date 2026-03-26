import { Router, Request, Response } from "express";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { getTreasuryProgram, getVaultPda } from "../services/solana";
import { adminKeypair, config, connection } from "../config";
import { requireAdmin } from "../middleware/auth";
import { createDemoVault, listDemoVaults } from "../services/demo-store";

const router = Router();

async function getTreasuryRuntimeStatus() {
  const treasuryProgramId = new PublicKey(config.treasuryProgramId);
  const treasuryProgramAccount = await connection
    .getAccountInfo(treasuryProgramId)
    .catch(() => null);

  if (!treasuryProgramAccount) {
    return {
      ok: false,
      status: 503,
      message: `Treasury program ${treasuryProgramId.toBase58()} is not deployed on ${config.rpcUrl}.`,
    };
  }

  const adminAccount = await connection
    .getAccountInfo(adminKeypair.publicKey)
    .catch(() => null);

  if (!adminAccount) {
    return {
      ok: false,
      status: 503,
      message: `Admin wallet ${adminKeypair.publicKey.toBase58()} does not exist on ${config.rpcUrl}. Fund it before initializing a treasury vault.`,
    };
  }

  const adminBalance = await connection.getBalance(adminKeypair.publicKey);
  if (adminBalance < 0.01 * anchor.web3.LAMPORTS_PER_SOL) {
    return {
      ok: false,
      status: 503,
      message: `Admin wallet ${adminKeypair.publicKey.toBase58()} has insufficient SOL on ${config.rpcUrl}.`,
    };
  }

  return { ok: true, status: 200, message: null };
}

/**
 * POST /treasury/init
 * Initialize a new treasury vault for an institution.
 */
router.post("/init", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { institutionId, signers, threshold } = req.body;

    if (!institutionId || !signers || !threshold) {
      return res.status(400).json({
        error: "Missing required fields: institutionId, signers, threshold",
      });
    }

    const runtimeStatus = await getTreasuryRuntimeStatus();
    if (!runtimeStatus.ok) {
      const demoVault = createDemoVault({
        institutionId,
        authority: signers[0],
        threshold,
      });
      return res.json({
        success: true,
        mode: "demo",
        warning: runtimeStatus.message,
        vaultAddress: demoVault.address,
        institutionId: demoVault.institutionId,
      });
    }

    const treasuryProgram = getTreasuryProgram();
    const institutionPubkey = new PublicKey(institutionId);
    const signerPubkeys = signers.map((s: string) => new PublicKey(s));

    const tx = await treasuryProgram.methods
      .initVault(institutionPubkey, signerPubkeys, threshold)
      .accountsPartial({
        authority: adminKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const [vaultPda] = getVaultPda(institutionPubkey);

    res.json({
      success: true,
      tx,
      vaultAddress: vaultPda.toBase58(),
      institutionId,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /treasury/:institutionId
 * Get vault information for an institution.
 */
router.get("/:institutionId", async (req: Request, res: Response) => {
  try {
    const treasuryProgram = getTreasuryProgram();
    const institutionPubkey = new PublicKey(req.params.institutionId);
    const [vaultPda] = getVaultPda(institutionPubkey);
    const treasuryAccounts = treasuryProgram.account as any;

    const vault = await treasuryAccounts.treasuryVault
      .fetchNullable(vaultPda)
      .catch(() => null);

    if (!vault) {
      return res.status(404).json({ error: "Vault not found" });
    }

    res.json({
      address: vaultPda.toBase58(),
      institutionId: (vault.institutionId as PublicKey).toBase58(),
      authority: (vault.authority as PublicKey).toBase58(),
      signers: (vault.signers as PublicKey[]).map((s) => s.toBase58()),
      threshold: vault.threshold,
      totalDeposited: (vault.totalDeposited as any).toNumber(),
      totalWithdrawn: (vault.totalWithdrawn as any).toNumber(),
      lastActivity: (vault.lastActivity as any).toNumber(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /treasury
 * List all treasury vaults.
 */
router.get("/", async (_req: Request, res: Response) => {
  try {
    const demoVaults = listDemoVaults();
    const treasuryProgramId = new PublicKey(config.treasuryProgramId);
    const treasuryProgramAccount = await connection
      .getAccountInfo(treasuryProgramId)
      .catch(() => null);

    if (!treasuryProgramAccount) {
      return res.json({
        vaults: demoVaults,
        message:
          demoVaults.length > 0
            ? `Showing demo treasury vaults because program ${treasuryProgramId.toBase58()} is not deployed on ${config.rpcUrl}.`
            : `Treasury program ${treasuryProgramId.toBase58()} is not deployed on ${config.rpcUrl}.`,
      });
    }

    const treasuryProgram = getTreasuryProgram();
    const treasuryAccounts = treasuryProgram.account as any;
    const vaults = await treasuryAccounts.treasuryVault.all();

    const onChainVaults = vaults.map((v: any) => ({
        address: v.publicKey.toBase58(),
        institutionId: (v.account.institutionId as PublicKey).toBase58(),
        authority: (v.account.authority as PublicKey).toBase58(),
        threshold: v.account.threshold,
        totalDeposited: (v.account.totalDeposited as any).toNumber(),
        totalWithdrawn: (v.account.totalWithdrawn as any).toNumber(),
      }));

    res.json({
      vaults: [...onChainVaults, ...demoVaults],
      message:
        onChainVaults.length + demoVaults.length === 0
          ? `No treasury vaults were found on ${config.rpcUrl}.`
          : null,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
