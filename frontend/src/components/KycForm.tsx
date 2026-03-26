"use client";

import { FC, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { BACKEND_URL } from "@/lib/constants";

const REGIONS = [
  { code: "CH", label: "Switzerland" },
  { code: "DE", label: "Germany" },
  { code: "GB", label: "United Kingdom" },
  { code: "US", label: "United States" },
  { code: "SG", label: "Singapore" },
  { code: "NG", label: "Nigeria" },
  { code: "AE", label: "UAE" },
];

const KYC_TIERS = [
  { value: 1, label: "Basic (Tier 1)" },
  { value: 2, label: "Institutional (Tier 2)" },
];

export const KycForm: FC<{ onSuccess?: () => void }> = ({ onSuccess }) => {
  const { publicKey, connected } = useWallet();
  const [wallet, setWallet] = useState("");
  const [kycTier, setKycTier] = useState(1);
  const [regionCode, setRegionCode] = useState("CH");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connected) {
      setStatus("Connect your admin wallet first.");
      return;
    }

    const targetWallet = wallet.trim() || publicKey?.toBase58();
    if (!targetWallet) {
      setStatus("Enter a wallet address.");
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const res = await fetch(`${BACKEND_URL}/compliance/whitelist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: targetWallet,
          kycTier,
          regionCode,
          isSanctioned: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setStatus(data.message);
      setWallet("");
      onSuccess?.();
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-gray-400 text-xs mb-1">
          Wallet Address
        </label>
        <input
          type="text"
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          placeholder={publicKey?.toBase58() || "Solana wallet address"}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />
        <p className="text-gray-600 text-xs mt-1">
          Leave blank to whitelist your connected wallet
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-gray-400 text-xs mb-1">KYC Tier</label>
          <select
            value={kycTier}
            onChange={(e) => setKycTier(Number(e.target.value))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
          >
            {KYC_TIERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-gray-400 text-xs mb-1">Region</label>
          <select
            value={regionCode}
            onChange={(e) => setRegionCode(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
          >
            {REGIONS.map((r) => (
              <option key={r.code} value={r.code}>
                {r.code} - {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || !connected}
        className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-2 rounded-lg transition text-sm"
      >
        {loading ? "Submitting..." : "Add to KYC Whitelist"}
      </button>

      {status && (
        <div className="bg-gray-800 rounded-lg p-2">
          <p
            className={`text-sm ${
              status.startsWith("Error") ? "text-red-400" : "text-green-400"
            }`}
          >
            {status}
          </p>
        </div>
      )}
    </form>
  );
};
