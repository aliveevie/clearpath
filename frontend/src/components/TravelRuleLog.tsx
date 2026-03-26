"use client";

import { FC, useEffect, useState } from "react";
import { BACKEND_URL } from "@/lib/constants";

interface TravelRuleRecord {
  address: string;
  txSignature: string;
  amount: number;
  currencyPair: string;
  senderVasp: string;
  receiverVasp: string;
  timestamp: number;
}

export const TravelRuleLog: FC = () => {
  const [records, setRecords] = useState<TravelRuleRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRecords() {
      try {
        const res = await fetch(`${BACKEND_URL}/compliance/travel-rules`);
        const data = await res.json();
        setRecords(data.records || []);
      } catch (err) {
        console.error("Failed to fetch travel rules:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchRecords();
  }, []);

  if (loading) {
    return <div className="text-gray-400 p-4">Loading travel rule records...</div>;
  }

  return (
    <div className="space-y-3">
      {records.map((record) => (
        <div
          key={record.address}
          className="bg-gray-900 border border-gray-800 rounded-lg p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-gray-500">
              {record.txSignature.slice(0, 16)}...
            </span>
            <span className="text-xs text-gray-400">
              {new Date(record.timestamp * 1000).toLocaleString()}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-gray-400 text-xs">Amount</p>
              <p className="text-white font-medium">
                {(record.amount / 1_000_000).toLocaleString()} USDC
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Currency Pair</p>
              <p className="text-white font-medium">{record.currencyPair}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Sender VASP</p>
              <p className="text-gray-300 font-mono text-xs">
                {record.senderVasp.slice(0, 8)}...{record.senderVasp.slice(-4)}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Receiver VASP</p>
              <p className="text-gray-300 font-mono text-xs">
                {record.receiverVasp.slice(0, 8)}...
                {record.receiverVasp.slice(-4)}
              </p>
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-gray-800">
            <span className="px-2 py-1 bg-blue-900/30 text-blue-400 text-xs rounded-full">
              Encrypted payload on-chain
            </span>
          </div>
        </div>
      ))}
      {records.length === 0 && (
        <div className="text-center text-gray-500 py-8">
          No travel rule records found
        </div>
      )}
    </div>
  );
};
