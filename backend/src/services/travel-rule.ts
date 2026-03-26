import { PublicKey } from "@solana/web3.js";
import { getHookProgram, getTravelRulePda } from "./solana";
import { config } from "../config";

export interface TravelRuleEntry {
  address: string;
  txSignature: string;
  amount: number;
  currencyPair: string;
  senderVasp: string;
  receiverVasp: string;
  timestamp: number;
}

/**
 * Fetch a specific Travel Rule record by tx signature.
 */
export async function getTravelRuleRecord(
  txSignature: Uint8Array
): Promise<TravelRuleEntry | null> {
  const hookProgram = getHookProgram();
  const hookAccounts = hookProgram.account as any;
  const [pda] = getTravelRulePda(txSignature);

  try {
    const record = await hookAccounts.travelRuleRecord.fetch(pda);
    return {
      address: pda.toBase58(),
      txSignature: Buffer.from(record.txSignature as number[]).toString("hex"),
      amount: (record.amount as any).toNumber(),
      currencyPair: Buffer.from(record.currencyPair as number[])
        .toString("utf-8")
        .replace(/\0/g, ""),
      senderVasp: (record.senderVasp as PublicKey).toBase58(),
      receiverVasp: (record.receiverVasp as PublicKey).toBase58(),
      timestamp: (record.timestamp as any).toNumber(),
    };
  } catch {
    return null;
  }
}

/**
 * Fetch all Travel Rule records (program account scan).
 */
export async function getAllTravelRuleRecords(): Promise<TravelRuleEntry[]> {
  const hookProgram = getHookProgram();
  const hookAccounts = hookProgram.account as any;

  try {
    const records = await hookAccounts.travelRuleRecord.all();
    return records.map((r: any) => ({
      address: r.publicKey.toBase58(),
      txSignature: Buffer.from(r.account.txSignature as number[]).toString(
        "hex"
      ),
      amount: (r.account.amount as any).toNumber(),
      currencyPair: Buffer.from(r.account.currencyPair as number[])
        .toString("utf-8")
        .replace(/\0/g, ""),
      senderVasp: (r.account.senderVasp as PublicKey).toBase58(),
      receiverVasp: (r.account.receiverVasp as PublicKey).toBase58(),
      timestamp: (r.account.timestamp as any).toNumber(),
    }));
  } catch {
    return [];
  }
}
