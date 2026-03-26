import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { provider, config } from "../config";
import fs from "fs";
import path from "path";

// Load IDLs.
// In Vercel serverless, only `dist/` is reliably packaged, so we copy the
// IDLs into `dist/target/idl/` during build and resolve from multiple paths.
function resolveIdlPath(fileName: string): string {
  const candidates = [
    // Production/serverless (after `tsc` + copy step)
    path.join(__dirname, "../target/idl/", fileName),
    // Local dev from TS sources
    path.join(__dirname, "../../../target/idl/", fileName),
    // Extra fallbacks (handles different cwd/layouts)
    path.join(process.cwd(), "target/idl/", fileName),
    path.join(process.cwd(), "..", "target/idl/", fileName),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

const hookIdlPath = resolveIdlPath("clearpath_hook.json");
const treasuryIdlPath = resolveIdlPath("clearpath_treasury.json");

let hookProgram: Program;
let treasuryProgram: Program;

export function initPrograms() {
  const hookIdl = JSON.parse(fs.readFileSync(hookIdlPath, "utf-8"));
  const treasuryIdl = JSON.parse(fs.readFileSync(treasuryIdlPath, "utf-8"));

  hookProgram = new Program(hookIdl, provider);
  treasuryProgram = new Program(treasuryIdl, provider);
}

export function getHookProgram(): Program {
  if (!hookProgram) initPrograms();
  return hookProgram;
}

export function getTreasuryProgram(): Program {
  if (!treasuryProgram) initPrograms();
  return treasuryProgram;
}

// PDA derivations
export function getWhitelistPda(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("kyc"), wallet.toBuffer()],
    new PublicKey(config.hookProgramId)
  );
}

export function getTravelRulePda(
  txSignature: Uint8Array
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("travel"), Buffer.from(txSignature.slice(0, 32))],
    new PublicKey(config.hookProgramId)
  );
}

export function getFxConfigPda(
  currencyPair: string
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("fx"), Buffer.from(currencyPair)],
    new PublicKey(config.hookProgramId)
  );
}

export function getVaultPda(
  institutionId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), institutionId.toBuffer()],
    new PublicKey(config.treasuryProgramId)
  );
}
