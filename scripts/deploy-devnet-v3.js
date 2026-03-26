/**
 * Deploy Solana programs to devnet using web3.js directly.
 * Works around the Agave v3 CLI bug where getAccountInfo returns 400 for non-existent accounts.
 */
const {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  BpfLoader,
  BPF_LOADER_PROGRAM_ID,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  PublicKey,
} = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.join(__dirname, "..");
const RPC_URL = "https://api.devnet.solana.com";
const WALLET_PATH = path.join(os.homedir(), ".config/solana/id.json");

function loadKeypair(filePath) {
  const secret = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

// Manually deploy using BPF Upgradeable Loader
// This replicates what `solana program deploy` does internally
async function deployUpgradeableProgram(connection, payer, programKeypairPath, soPath) {
  const programKeypair = loadKeypair(programKeypairPath);
  const programData = fs.readFileSync(soPath);
  const programId = programKeypair.publicKey;

  console.log(`  Program ID: ${programId.toBase58()}`);
  console.log(`  Binary size: ${programData.length} bytes`);

  // Use BpfLoader.load with BPF_LOADER_DEPRECATED? No — use upgradeable loader.
  // The BPF Upgradeable Loader program ID
  const BPF_LOADER_UPGRADEABLE = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

  // Step 1: Create a buffer account
  const bufferKeypair = Keypair.generate();
  const programLen = programData.length;
  // Buffer account needs: 4 (enum) + 32 (authority) + 4 (data len) + data
  const bufferSize = 37 + programLen + 8; // UpgradeableLoaderState::Buffer header + data
  const bufferRent = await connection.getMinimumBalanceForRentExemption(bufferSize);

  console.log(`  Buffer rent: ${bufferRent / LAMPORTS_PER_SOL} SOL`);

  // Create buffer account
  const createBufferTx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: bufferKeypair.publicKey,
      lamports: bufferRent,
      space: bufferSize,
      programId: BPF_LOADER_UPGRADEABLE,
    })
  );

  // Initialize buffer
  // InitializeBuffer instruction: [0, 0, 0, 0] (little-endian u32 = 0)
  const initBufferIx = {
    keys: [
      { pubkey: bufferKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: payer.publicKey, isSigner: false, isWritable: false },
    ],
    programId: BPF_LOADER_UPGRADEABLE,
    data: Buffer.from([0, 0, 0, 0]), // InitializeBuffer
  };
  createBufferTx.add(initBufferIx);

  console.log("  Creating buffer account...");
  await sendAndConfirmTransaction(connection, createBufferTx, [payer, bufferKeypair], {
    commitment: "confirmed",
  });

  // Step 2: Write program data to buffer in chunks
  const CHUNK_SIZE = 1000; // ~1KB chunks to stay within tx size limit
  const totalChunks = Math.ceil(programData.length / CHUNK_SIZE);
  console.log(`  Writing ${totalChunks} chunks to buffer...`);

  for (let i = 0; i < programData.length; i += CHUNK_SIZE) {
    const chunk = programData.slice(i, Math.min(i + CHUNK_SIZE, programData.length));
    const offset = i;
    const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;

    // Write instruction (bincode serialized):
    // enum tag (u32 LE) = 1 for Write
    // offset (u32 LE)
    // vec length (u64 LE) — bincode uses u64 for Vec length
    // data bytes
    const writeData = Buffer.alloc(4 + 4 + 8 + chunk.length);
    writeData.writeUInt32LE(1, 0); // Write instruction
    writeData.writeUInt32LE(offset, 4); // offset
    writeData.writeUInt32LE(chunk.length, 8); // vec length low 32 bits
    writeData.writeUInt32LE(0, 12); // vec length high 32 bits
    chunk.copy(writeData, 16);

    const writeIx = {
      keys: [
        { pubkey: bufferKeypair.publicKey, isSigner: false, isWritable: true },
        { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      ],
      programId: BPF_LOADER_UPGRADEABLE,
      data: writeData,
    };

    const writeTx = new Transaction().add(writeIx);

    let retries = 3;
    while (retries > 0) {
      try {
        await sendAndConfirmTransaction(connection, writeTx, [payer], {
          commitment: "confirmed",
        });
        break;
      } catch (err) {
        retries--;
        if (retries === 0) throw err;
        console.log(`    Chunk ${chunkNum}/${totalChunks} failed, retrying... (${retries} left)`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (chunkNum % 50 === 0 || chunkNum === totalChunks) {
      console.log(`    ${chunkNum}/${totalChunks} chunks written`);
    }
  }

  // Step 3: Deploy (create program account + set buffer as program data)
  const programDataSize = 45 + programLen * 2; // ProgramData header + space for upgrades
  const programRent = await connection.getMinimumBalanceForRentExemption(36); // Program account (just holds pointer)

  // DeployWithMaxDataLen instruction
  // enum tag (u32 LE) = 2 for DeployWithMaxDataLen
  // max_data_len (u64 LE)
  const deployData = Buffer.alloc(4 + 8);
  deployData.writeUInt32LE(2, 0); // DeployWithMaxDataLen
  // Write max_data_len as u64 LE
  const maxDataLen = programLen; // exact fit — saves ~2 SOL vs 2x buffer
  deployData.writeUInt32LE(maxDataLen, 4);
  deployData.writeUInt32LE(0, 8);

  // Derive programdata address
  const [programDataAddress] = PublicKey.findProgramAddressSync(
    [programId.toBuffer()],
    BPF_LOADER_UPGRADEABLE
  );

  const deployIx = {
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true }, // payer
      { pubkey: programDataAddress, isSigner: false, isWritable: true }, // programdata
      { pubkey: programId, isSigner: true, isWritable: true }, // program
      { pubkey: bufferKeypair.publicKey, isSigner: false, isWritable: true }, // buffer
      { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
      { pubkey: new PublicKey("SysvarC1ock11111111111111111111111111111111"), isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: payer.publicKey, isSigner: true, isWritable: false }, // upgrade authority
    ],
    programId: BPF_LOADER_UPGRADEABLE,
    data: deployData,
  };

  // Need to create the program account first
  const createProgramTx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: programId,
      lamports: programRent,
      space: 36,
      programId: BPF_LOADER_UPGRADEABLE,
    })
  );

  console.log("  Creating program account...");
  await sendAndConfirmTransaction(connection, createProgramTx, [payer, programKeypair], {
    commitment: "confirmed",
  });

  console.log("  Deploying from buffer...");
  const deployTx = new Transaction().add(deployIx);
  await sendAndConfirmTransaction(connection, deployTx, [payer, programKeypair], {
    commitment: "confirmed",
  });

  console.log(`  Deployed successfully!`);
  return programId.toBase58();
}

async function main() {
  console.log("=== ClearPath Devnet Deployment ===\n");

  const connection = new Connection(RPC_URL, "confirmed");
  const payer = loadKeypair(WALLET_PATH);
  const balance = await connection.getBalance(payer.publicKey);

  console.log(`Payer: ${payer.publicKey.toBase58()}`);
  console.log(`Balance: ${balance / LAMPORTS_PER_SOL} SOL\n`);

  if (balance < 5 * LAMPORTS_PER_SOL) {
    console.error("Need at least 5 SOL. Fund at https://faucet.solana.com");
    process.exit(1);
  }

  console.log("Deploying clearpath_hook...");
  const hookId = await deployUpgradeableProgram(
    connection, payer,
    path.join(ROOT, "target/deploy/clearpath_hook-keypair.json"),
    path.join(ROOT, "target/deploy/clearpath_hook.so")
  );

  console.log("\nDeploying clearpath_treasury...");
  const treasuryId = await deployUpgradeableProgram(
    connection, payer,
    path.join(ROOT, "target/deploy/clearpath_treasury-keypair.json"),
    path.join(ROOT, "target/deploy/clearpath_treasury.so")
  );

  console.log("\n=== Deploy Summary ===");
  console.log(`Hook:     ${hookId}`);
  console.log(`Treasury: ${treasuryId}`);

  // Update backend .env
  const envPath = path.join(ROOT, "backend/.env");
  if (fs.existsSync(envPath)) {
    let env = fs.readFileSync(envPath, "utf-8");
    env = env.replace(/RPC_URL=.*/, `RPC_URL=${RPC_URL}`);
    env = env.replace(/HOOK_PROGRAM_ID=.*/, `HOOK_PROGRAM_ID=${hookId}`);
    env = env.replace(/TREASURY_PROGRAM_ID=.*/, `TREASURY_PROGRAM_ID=${treasuryId}`);
    fs.writeFileSync(envPath, env);
    console.log("\nBackend .env updated.");
  }

  const finalBalance = await connection.getBalance(payer.publicKey);
  console.log(`\nFinal balance: ${finalBalance / LAMPORTS_PER_SOL} SOL`);
  console.log(`Deploy cost: ${(balance - finalBalance) / LAMPORTS_PER_SOL} SOL`);

  console.log("\nNext steps:");
  console.log("  RPC_URL=https://api.devnet.solana.com npx ts-node scripts/init-mint.ts");
  console.log("  RPC_URL=https://api.devnet.solana.com npx ts-node scripts/demo-transfer.ts");
}

main().catch(err => { console.error(err); process.exit(1); });
