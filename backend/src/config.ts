import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

// Resolve program IDs: env var > Anchor.toml > error
function resolveAnchorProgramIds(): {
  hook: string;
  treasury: string;
} {
  let hook = process.env.HOOK_PROGRAM_ID || "";
  let treasury = process.env.TREASURY_PROGRAM_ID || "";

  // Fall back to Anchor.toml if env vars are not set
  if (!hook || !treasury) {
    try {
      const anchorTomlPath = path.join(__dirname, "../../Anchor.toml");
      const anchorToml = fs.readFileSync(anchorTomlPath, "utf-8");
      if (!hook) {
        const match = anchorToml.match(
          /clearpath_hook\s*=\s*"([A-Za-z0-9]+)"/
        );
        if (match) hook = match[1];
      }
      if (!treasury) {
        const match = anchorToml.match(
          /clearpath_treasury\s*=\s*"([A-Za-z0-9]+)"/
        );
        if (match) treasury = match[1];
      }
    } catch {
      // Anchor.toml not found — rely on env vars
    }
  }

  return { hook, treasury };
}

const programIds = resolveAnchorProgramIds();

function expandTilde(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return path.join(process.env.HOME || "", p.slice(1));
  }
  return p;
}

export const config = {
  rpcUrl: process.env.RPC_URL || "https://api.devnet.solana.com",
  walletPath: expandTilde(
    process.env.WALLET_PATH ||
      path.join(process.env.HOME || "~", ".config/solana/id.json")
  ),
  hookProgramId: programIds.hook,
  treasuryProgramId: programIds.treasury,
  sixApiKey: process.env.SIX_API_KEY || "",
  sixApiUrl:
    process.env.SIX_API_URL || "https://api.six-group.com/api/findata/v1",
  port: parseInt(process.env.PORT || "3001", 10),
};

// Validate required program IDs at import time.
// Do not `process.exit()` here: in serverless environments, that breaks even
// basic endpoints like `/health` if env vars aren't present.
function validateConfig() {
  const missing: string[] = [];
  if (!config.hookProgramId) missing.push("HOOK_PROGRAM_ID");
  if (!config.treasuryProgramId) missing.push("TREASURY_PROGRAM_ID");

  if (missing.length > 0) {
    console.warn(
      `Missing required config: ${missing.join(", ")}. ` +
        `The server can still start (e.g. for /health), but Solana-backed routes may fail.`
    );
    return;
  }

  // Validate they are valid public keys
  try {
    new PublicKey(config.hookProgramId);
  } catch {
    console.warn(
      `Invalid HOOK_PROGRAM_ID: "${config.hookProgramId}" is not a valid public key.`
    );
    return;
  }
  try {
    new PublicKey(config.treasuryProgramId);
  } catch {
    console.warn(
      `Invalid TREASURY_PROGRAM_ID: "${config.treasuryProgramId}" is not a valid public key.`
    );
    return;
  }
}

validateConfig();

// Solana connection
export const connection = new Connection(config.rpcUrl, "confirmed");

// Load admin keypair
let adminKeypair: Keypair;
try {
  const secretKey = JSON.parse(fs.readFileSync(config.walletPath, "utf-8"));
  adminKeypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
} catch {
  console.warn("Admin wallet not found, using generated keypair");
  adminKeypair = Keypair.generate();
}
export { adminKeypair };

// Anchor provider
export const provider = new AnchorProvider(
  connection,
  new Wallet(adminKeypair),
  { commitment: "confirmed" }
);
