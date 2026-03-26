"use client";

import { FC, useEffect, useState } from "react";
import { BACKEND_URL } from "@/lib/constants";

interface WhitelistEntry {
  address: string;
  wallet: string;
  kycTier: number;
  kycExpiry: number;
  regionCode: string;
  isSanctioned: boolean;
}

export const ComplianceTable: FC = () => {
  const [entries, setEntries] = useState<WhitelistEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEntries() {
      try {
        const res = await fetch(`${BACKEND_URL}/compliance/whitelist`);
        const data = await res.json();
        setEntries(data.entries || []);
      } catch (err) {
        console.error("Failed to fetch whitelist:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchEntries();
  }, []);

  const getStatusColor = (entry: WhitelistEntry) => {
    if (entry.isSanctioned) return "text-red-400 bg-red-900/30";
    if (entry.kycExpiry * 1000 < Date.now()) return "text-yellow-400 bg-yellow-900/30";
    return "text-green-400 bg-green-900/30";
  };

  const getStatusText = (entry: WhitelistEntry) => {
    if (entry.isSanctioned) return "Sanctioned";
    if (entry.kycExpiry * 1000 < Date.now()) return "Expired";
    return "Active";
  };

  if (loading) {
    return <div className="text-gray-400 p-4">Loading whitelist data...</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left text-gray-400 font-medium py-3 px-4">Wallet</th>
            <th className="text-left text-gray-400 font-medium py-3 px-4">KYC Tier</th>
            <th className="text-left text-gray-400 font-medium py-3 px-4">Region</th>
            <th className="text-left text-gray-400 font-medium py-3 px-4">Expiry</th>
            <th className="text-left text-gray-400 font-medium py-3 px-4">Status</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={entry.address}
              className="border-b border-gray-800/50 hover:bg-gray-800/30"
            >
              <td className="py-3 px-4 font-mono text-gray-300 text-xs">
                {entry.wallet.slice(0, 8)}...{entry.wallet.slice(-4)}
              </td>
              <td className="py-3 px-4 text-gray-300">
                {entry.kycTier === 2 ? "Institutional" : "Basic"}
              </td>
              <td className="py-3 px-4 text-gray-300">{entry.regionCode}</td>
              <td className="py-3 px-4 text-gray-300">
                {new Date(entry.kycExpiry * 1000).toLocaleDateString()}
              </td>
              <td className="py-3 px-4">
                <span
                  className={`px-2 py-1 rounded-full text-xs ${getStatusColor(
                    entry
                  )}`}
                >
                  {getStatusText(entry)}
                </span>
              </td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-gray-500">
                No whitelist entries found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
