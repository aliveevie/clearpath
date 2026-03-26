import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { provider, config } from "../config";
import fs from "fs";
import path from "path";

// Load IDLs
const hookIdlPath = path.join(
  __dirname,
  "../../../target/idl/clearpath_hook.json"
);
const treasuryIdlPath = path.join(
  __dirname,
  "../../../target/idl/clearpath_treasury.json"
);

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
