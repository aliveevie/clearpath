"use client";

import { FC, useEffect, useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { BACKEND_URL } from "@/lib/constants";

interface TransferRecord {
  signature: string;
  timestamp: number;
  amount: number;
  targetCurrency: string;
  type: "sent" | "received";
  counterparty: string;
}

export const TransactionHistory: FC = () => {
  const { publicKey, connected } = useWallet();
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);

    try {
      const res = await fetch(
        `${BACKEND_URL}/transfers/history/${publicKey.toBase58()}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTransfers(data.transfers || []);
    } catch {
      setTransfers([]);
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    fetchHistory();

    const handleDataChanged = () => {
      setTimeout(fetchHistory, 1500);
    };
    window.addEventListener("clearpath:data-changed", handleDataChanged);
    return () =>
      window.removeEventListener("clearpath:data-changed", handleDataChanged);
  }, [fetchHistory]);

  if (!connected) {
    return (
      <p className="text-gray-500 text-sm py-4 text-center">
        Connect wallet to view history.
      </p>
    );
  }

  if (loading && transfers.length === 0) {
    return (
      <p className="text-gray-400 text-sm py-4 text-center">
        Loading...
      </p>
    );
  }

  if (transfers.length === 0) {
    return (
      <p className="text-gray-500 text-sm py-4 text-center">
        No transfers yet.
      </p>
    );
  }

  return (
    <div className="space-y-2 max-h-80 overflow-y-auto">
      {transfers.map((tx, i) => (
        <div
          key={tx.signature || i}
          className="flex items-center justify-between bg-gray-800/50 rounded-lg px-4 py-3"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  tx.type === "sent"
                    ? "bg-red-900/40 text-red-400"
                    : "bg-green-900/40 text-green-400"
                }`}
              >
                {tx.type === "sent" ? "Sent" : "Received"}
              </span>
              <span className="text-white font-medium text-sm">
                {tx.type === "sent" ? "-" : "+"}
                {tx.amount.toLocaleString()} USDC
              </span>
              <span className="text-gray-500 text-xs">
                {tx.targetCurrency}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-gray-500 text-xs">
                {tx.type === "sent" ? "To:" : "From:"}
              </span>
              <span className="text-gray-500 text-xs font-mono truncate">
                {tx.counterparty.slice(0, 8)}...{tx.counterparty.slice(-4)}
              </span>
              <span className="text-gray-600 text-xs">
                {new Date(tx.timestamp).toLocaleTimeString()}
              </span>
            </div>
          </div>
          {tx.signature && (
            <a
              href={`https://explorer.solana.com/tx/${tx.signature}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 text-xs ml-2 shrink-0"
            >
              View
            </a>
          )}
        </div>
      ))}
    </div>
  );
};
