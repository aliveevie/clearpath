const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Connection, Keypair, LAMPORTS_PER_SOL } = require("@solana/web3.js");

const ROOT = path.join(__dirname, "..");
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const WALLET_PATH =
  process.env.WALLET_PATH || path.join(os.homedir(), ".config/solana/id.json");

function loadKeypair(filePath) {
  const secret = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function deployWithCli(name, soFile, keypairFile) {
  console.log(`\nDeploying ${name}...`);
  const programKeypair = loadKeypair(keypairFile);
  console.log(`Program ID: ${programKeypair.publicKey.toBase58()}`);

  try {
    const result = execSync(
      [
        "solana program deploy",
        `"${soFile}"`,
        `--program-id "${keypairFile}"`,
        `--keypair "${WALLET_PATH}"`,
        `--url "${RPC_URL}"`,
        "--use-rpc",
        "--commitment confirmed",
      ].join(" "),
      { encoding: "utf-8", stdio: "pipe", timeout: 300_000 }
    );
    console.log(result.trim());
    return { name, programId: programKeypair.publicKey.toBase58(), success: true };
  } catch (error) {
    console.error(`Deploy failed for ${name}:`, error.stderr || error.message);
    return { name, programId: programKeypair.publicKey.toBase58(), success: false, error: error.stderr || error.message };
  }
}

async function main() {
  const payer = loadKeypair(WALLET_PATH);
  const connection = new Connection(RPC_URL, "confirmed");
  const balance = await connection.getBalance(payer.publicKey);

  console.log("=== ClearPath Devnet Deploy ===");
  console.log(`RPC: ${RPC_URL}`);
  console.log(`Payer: ${payer.publicKey.toBase58()}`);
  console.log(`Balance: ${balance / LAMPORTS_PER_SOL} SOL`);

  // Check minimum balance (rough estimate: ~2.1 SOL per program + tx fees)
  const MIN_BALANCE = 5 * LAMPORTS_PER_SOL;
  if (balance < MIN_BALANCE) {
    console.error(
      `\nInsufficient balance. Need at least ${MIN_BALANCE / LAMPORTS_PER_SOL} SOL.`
    );
    console.error("Fund the wallet via https://faucet.solana.com");
    console.error(`Wallet address: ${payer.publicKey.toBase58()}`);
    process.exit(1);
  }

  // Deploy hook
  const hookResult = deployWithCli(
    "clearpath_hook",
    path.join(ROOT, "target/deploy/clearpath_hook.so"),
    path.join(ROOT, "target/deploy/clearpath_hook-keypair.json")
  );

  // Deploy treasury
  const treasuryResult = deployWithCli(
    "clearpath_treasury",
    path.join(ROOT, "target/deploy/clearpath_treasury.so"),
    path.join(ROOT, "target/deploy/clearpath_treasury-keypair.json")
  );

  console.log("\n=== Deploy Summary ===");
  console.log(`Hook:     ${hookResult.success ? "SUCCESS" : "FAILED"} — ${hookResult.programId}`);
  console.log(`Treasury: ${treasuryResult.success ? "SUCCESS" : "FAILED"} — ${treasuryResult.programId}`);

  if (hookResult.success && treasuryResult.success) {
    // Update backend .env
    const envPath = path.join(ROOT, "backend/.env");
    if (fs.existsSync(envPath)) {
      let env = fs.readFileSync(envPath, "utf-8");
      env = env.replace(
        /RPC_URL=.*/,
        `RPC_URL=${RPC_URL}`
      );
      env = env.replace(
        /HOOK_PROGRAM_ID=.*/,
        `HOOK_PROGRAM_ID=${hookResult.programId}`
      );
      env = env.replace(
        /TREASURY_PROGRAM_ID=.*/,
        `TREASURY_PROGRAM_ID=${treasuryResult.programId}`
      );
      fs.writeFileSync(envPath, env);
      console.log("\nBackend .env updated with devnet program IDs and RPC.");
    }

    console.log("\nNext steps:");
    console.log("  1. RPC_URL=https://api.devnet.solana.com npx ts-node scripts/init-mint.ts");
    console.log("  2. RPC_URL=https://api.devnet.solana.com npx ts-node scripts/demo-transfer.ts");
    console.log("  3. cd backend && npm run dev");
    console.log("  4. cd frontend && npm run dev");
  } else {
    console.error("\nOne or more deploys failed. Check errors above.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("\nDevnet deployment failed:", error.message);
  process.exit(1);
});
