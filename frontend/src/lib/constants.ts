import { PublicKey } from "@solana/web3.js";

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

export const HOOK_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_HOOK_PROGRAM_ID ||
    "H1GnvpH6ExjedB3uDsB3UF2aNRKtTj7R7Zp14f4qzkem"
);

export const TREASURY_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_TREASURY_PROGRAM_ID ||
    "HK4LnUjmobjbcvhfgEUe3pdnf5N3GHZtqPDVy4TKzeA7"
);

export const TRAVEL_RULE_THRESHOLD = 1_000; // USDC
