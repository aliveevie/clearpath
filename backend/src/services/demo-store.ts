import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Keypair } from "@solana/web3.js";

export interface DemoVault {
  address: string;
  institutionId: string;
  authority: string;
  threshold: number;
  totalDeposited: number;
  totalWithdrawn: number;
  lastActivity: number;
  mode: "demo";
}

export interface DemoWhitelistEntry {
  address: string;
  wallet: string;
  kycTier: number;
  kycExpiry: number;
  regionCode: string;
  isSanctioned: boolean;
  mode: "demo";
}

export interface DemoTravelRuleRecord {
  address: string;
  txSignature: string;
  amount: number;
  currencyPair: string;
  senderVasp: string;
  receiverVasp: string;
  timestamp: number;
  mode: "demo";
}

interface DemoStore {
  vaults: DemoVault[];
  whitelistEntries: DemoWhitelistEntry[];
  travelRuleRecords: DemoTravelRuleRecord[];
}

const TRAVEL_RULE_THRESHOLD_RAW = 1_000 * 1_000_000;
const storePath = path.join(__dirname, "../../.demo-store.json");

function emptyStore(): DemoStore {
  return {
    vaults: [],
    whitelistEntries: [],
    travelRuleRecords: [],
  };
}

function readStore(): DemoStore {
  try {
    return JSON.parse(fs.readFileSync(storePath, "utf-8")) as DemoStore;
  } catch {
    return emptyStore();
  }
}

function writeStore(store: DemoStore) {
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

function newAddress() {
  return Keypair.generate().publicKey.toBase58();
}

function currencyToRegion(targetCurrency: string) {
  switch (targetCurrency) {
    case "CHF":
      return "CH";
    case "EUR":
      return "DE";
    case "GBP":
      return "GB";
    default:
      return "US";
  }
}

function upsertEntryInStore(
  store: DemoStore,
  wallet: string,
  overrides: Partial<Omit<DemoWhitelistEntry, "address" | "wallet" | "mode">>
) {
  const now = Math.floor(Date.now() / 1000);
  let entry = store.whitelistEntries.find((item) => item.wallet === wallet);

  if (!entry) {
    entry = {
      address: newAddress(),
      wallet,
      kycTier: 2,
      kycExpiry: now + 365 * 24 * 60 * 60,
      regionCode: "NG",
      isSanctioned: false,
      mode: "demo",
    };
    store.whitelistEntries.push(entry);
  }

  Object.assign(entry, overrides);
  return entry;
}

export function listDemoVaults(): DemoVault[] {
  return readStore().vaults;
}

export function listDemoWhitelistEntries(): DemoWhitelistEntry[] {
  return readStore().whitelistEntries;
}

export function listDemoTravelRuleRecords(): DemoTravelRuleRecord[] {
  return readStore().travelRuleRecords;
}

export function ensureDemoWhitelistEntry(
  wallet: string,
  overrides: Partial<Omit<DemoWhitelistEntry, "address" | "wallet" | "mode">> = {}
): DemoWhitelistEntry {
  const store = readStore();
  const entry = upsertEntryInStore(store, wallet, overrides);
  writeStore(store);
  return entry;
}

export function getDemoWhitelistEntry(wallet: string): DemoWhitelistEntry | null {
  return (
    readStore().whitelistEntries.find((entry) => entry.wallet === wallet) || null
  );
}

export function createDemoVault(input: {
  institutionId: string;
  authority: string;
  threshold: number;
}): DemoVault {
  const store = readStore();
  const existing = store.vaults.find(
    (vault) => vault.institutionId === input.institutionId
  );

  if (existing) {
    return existing;
  }

  const vault: DemoVault = {
    address: newAddress(),
    institutionId: input.institutionId,
    authority: input.authority,
    threshold: input.threshold,
    totalDeposited: 2_500 * 1_000_000,
    totalWithdrawn: 0,
    lastActivity: Math.floor(Date.now() / 1000),
    mode: "demo",
  };

  store.vaults.push(vault);
  writeStore(store);

  ensureDemoWhitelistEntry(input.institutionId, {
    kycTier: 2,
    regionCode: "NG",
  });

  return vault;
}

export function recordDemoTransfer(input: {
  senderWallet: string;
  recipientWallet: string;
  amountRaw: number;
  targetCurrency: string;
}) {
  const store = readStore();
  const now = Math.floor(Date.now() / 1000);
  const transferId = crypto.randomBytes(32).toString("hex");

  const senderEntry = upsertEntryInStore(store, input.senderWallet, {
    kycTier: 2,
    regionCode: "NG",
  });

  const recipientEntry = upsertEntryInStore(store, input.recipientWallet, {
    kycTier: 1,
    regionCode: currencyToRegion(input.targetCurrency),
  });

  if (senderEntry.isSanctioned || recipientEntry.isSanctioned) {
    throw new Error("Transfer rejected: a sanctioned wallet is involved.");
  }

  if (senderEntry.kycExpiry < now || recipientEntry.kycExpiry < now) {
    throw new Error("Transfer rejected: sender or recipient KYC is expired.");
  }

  const senderVault = store.vaults.find(
    (vault) => vault.institutionId === input.senderWallet
  );
  if (senderVault && senderVault.totalDeposited - senderVault.totalWithdrawn < input.amountRaw) {
    throw new Error("Transfer rejected: insufficient treasury balance.");
  }

  if (senderVault) {
    senderVault.totalWithdrawn += input.amountRaw;
    senderVault.lastActivity = now;
  }

  const recipientVault = store.vaults.find(
    (vault) => vault.institutionId === input.recipientWallet
  );
  if (recipientVault) {
    recipientVault.totalDeposited += input.amountRaw;
    recipientVault.lastActivity = now;
  }

  let travelRuleRecord: DemoTravelRuleRecord | null = null;
  if (input.amountRaw >= TRAVEL_RULE_THRESHOLD_RAW) {
    travelRuleRecord = {
      address: newAddress(),
      txSignature: transferId,
      amount: input.amountRaw,
      currencyPair: `USD${input.targetCurrency}`,
      senderVasp: input.senderWallet,
      receiverVasp: input.recipientWallet,
      timestamp: now,
      mode: "demo",
    };
    store.travelRuleRecords.unshift(travelRuleRecord);
  }

  writeStore(store);

  return {
    transferId,
    amountRaw: input.amountRaw,
    travelRuleRecord,
    mode: "demo" as const,
  };
}
