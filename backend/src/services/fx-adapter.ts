import { BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { config, adminKeypair, connection } from "../config";
import { getHookProgram, getFxConfigPda } from "./solana";

// Supported currency pairs (USD-denominated stablecoin to target fiat)
const CURRENCY_PAIRS = ["USDCHF", "USDEUR", "USDGBP"];

interface FxRate {
  pair: string;
  rate: number;
  timestamp: number;
}

interface SixListingResponse {
  data?: {
    listings?: Array<{
      marketData?: {
        last?: number;
      };
    }>;
  };
}

// In-memory cache of latest rates
const rateCache = new Map<string, FxRate>();
let lastOnChainSkipReason: string | null = null;

function isLocalRpc() {
  return (
    config.rpcUrl.includes("127.0.0.1") || config.rpcUrl.includes("localhost")
  );
}

async function ensureAdminCanWriteOnChain(): Promise<boolean> {
  const adminPubkey = adminKeypair.publicKey;
  let adminAccount;

  try {
    adminAccount = await connection.getAccountInfo(adminPubkey);
  } catch (error) {
    const reason =
      `Skipping on-chain FX sync: failed to query admin wallet on ${config.rpcUrl}.`;
    if (lastOnChainSkipReason !== reason) {
      console.warn(reason, error);
      lastOnChainSkipReason = reason;
    }
    return false;
  }

  if (!adminAccount) {
    if (isLocalRpc()) {
      try {
        const signature = await connection.requestAirdrop(adminPubkey, 2e9);
        const latestBlockhash = await connection.getLatestBlockhash();
        await connection.confirmTransaction(
          { signature, ...latestBlockhash },
          "confirmed"
        );
        lastOnChainSkipReason = null;
        return true;
      } catch (error) {
        const reason =
          "Skipping on-chain FX sync: admin wallet is not funded on the local validator and automatic airdrop failed.";
        if (lastOnChainSkipReason !== reason) {
          console.warn(reason, error);
          lastOnChainSkipReason = reason;
        }
        return false;
      }
    }

    const reason =
      `Skipping on-chain FX sync: admin wallet ${adminPubkey.toBase58()} does not exist on ${config.rpcUrl}.`;
    if (lastOnChainSkipReason !== reason) {
      console.warn(reason);
      lastOnChainSkipReason = reason;
    }
    return false;
  }

  let balance: number;
  try {
    balance = await connection.getBalance(adminPubkey);
  } catch (error) {
    const reason =
      `Skipping on-chain FX sync: failed to query admin SOL balance on ${config.rpcUrl}.`;
    if (lastOnChainSkipReason !== reason) {
      console.warn(reason, error);
      lastOnChainSkipReason = reason;
    }
    return false;
  }
  if (balance < 0.01 * 1e9) {
    const reason =
      `Skipping on-chain FX sync: admin wallet ${adminPubkey.toBase58()} has insufficient SOL (${balance / 1e9}).`;
    if (lastOnChainSkipReason !== reason) {
      console.warn(reason);
      lastOnChainSkipReason = reason;
    }
    return false;
  }

  const hookProgramId = new PublicKey(config.hookProgramId);
  const hookProgramInfo = await connection
    .getAccountInfo(hookProgramId)
    .catch(() => null);
  if (!hookProgramInfo) {
    const reason =
      `Skipping on-chain FX sync: hook program ${hookProgramId.toBase58()} is not deployed on ${config.rpcUrl}.`;
    if (lastOnChainSkipReason !== reason) {
      console.warn(reason);
      lastOnChainSkipReason = reason;
    }
    return false;
  }

  lastOnChainSkipReason = null;
  return true;
}

/**
 * Fetch FX rates from SIX BFI API.
 * Falls back to mock rates if the API is unavailable.
 */
export async function fetchFxRates(): Promise<FxRate[]> {
  const rates: FxRate[] = [];

  if (config.sixApiKey) {
    try {
      // SIX Financial Information API
      for (const pair of CURRENCY_PAIRS) {
        const baseCurrency = pair.substring(0, 3);
        const quoteCurrency = pair.substring(3, 6);

        const response = await fetch(
          `${config.sixApiUrl}/listings/marketData?select=TradingSymbol,Last&where=TradingSymbol=${baseCurrency}${quoteCurrency}`,
          {
            headers: {
              Accept: "application/json",
              "X-Api-Key": config.sixApiKey,
            },
          }
        );

        if (response.ok) {
          const data = (await response.json()) as SixListingResponse;
          const listing = data?.data?.listings?.[0];
          if (listing?.marketData?.last) {
            rates.push({
              pair,
              rate: Math.round(listing.marketData.last * 1_000_000),
              timestamp: Date.now(),
            });
          }
        }
      }
    } catch (error) {
      console.error("SIX API error, falling back to mock rates:", error);
    }
  }

  // Fallback to mock rates if API unavailable
  if (rates.length === 0) {
    rates.push(
      { pair: "USDCHF", rate: 883_450, timestamp: Date.now() },
      { pair: "USDEUR", rate: 921_500, timestamp: Date.now() },
      { pair: "USDGBP", rate: 792_300, timestamp: Date.now() }
    );
  }

  // Update cache
  for (const rate of rates) {
    rateCache.set(rate.pair, rate);
  }

  return rates;
}

/**
 * Push an FX rate on-chain to the fx_config PDA.
 */
export async function pushFxRateOnChain(pair: string, rate: number) {
  const hookProgram = getHookProgram();
  if (!(await ensureAdminCanWriteOnChain())) {
    return { action: "skipped", pair, rate };
  }
  const hookAccounts = hookProgram.account as any;
  const [fxConfigPda] = getFxConfigPda(pair);
  const currencyPairBytes = Array.from(
    Buffer.from(pair.padEnd(6, "\0"))
  ) as unknown as number[];

  // Check if config exists
  const existing = await hookAccounts.fxConfig
    .fetchNullable(fxConfigPda)
    .catch(() => null);

  if (existing) {
    const tx = await hookProgram.methods
      .updateFxRate(new BN(rate))
      .accountsPartial({
        fxConfig: fxConfigPda,
        authority: adminKeypair.publicKey,
      })
      .rpc();
    return { action: "updated", tx, pair, rate };
  } else {
    const tx = await hookProgram.methods
      .initFxConfig(currencyPairBytes, new BN(rate))
      .accountsPartial({
        authority: adminKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    return { action: "initialized", tx, pair, rate };
  }
}

/**
 * Start periodic FX rate updates.
 */
export function startFxRateUpdater(intervalMs: number = 60_000) {
  const update = async () => {
    try {
      const rates = await fetchFxRates();
      for (const rate of rates) {
        const result = await pushFxRateOnChain(rate.pair, rate.rate);
        if (result.action === "skipped") {
          continue;
        }
        console.log(`FX rate updated: ${rate.pair} = ${rate.rate / 1_000_000}`);
      }
    } catch (error) {
      console.error("FX rate update failed:", error);
    }
  };

  // Initial update
  update();

  // Periodic updates
  return setInterval(update, intervalMs);
}

/**
 * Get cached FX rate.
 */
export function getCachedRate(pair: string): FxRate | undefined {
  return rateCache.get(pair);
}

export function getAllCachedRates(): FxRate[] {
  return Array.from(rateCache.values());
}
