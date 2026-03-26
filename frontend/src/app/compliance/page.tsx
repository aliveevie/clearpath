"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ComplianceTable } from "@/components/ComplianceTable";
import { TravelRuleLog } from "@/components/TravelRuleLog";
import { KycForm } from "@/components/KycForm";
import { BACKEND_URL } from "@/lib/constants";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (mod) => mod.WalletMultiButton
    ),
  { ssr: false }
);

interface ComplianceStats {
  totalWhitelisted: number;
  activeWhitelisted: number;
  sanctionedCount: number;
  expiredCount: number;
  totalTravelRuleRecords: number;
  regionBreakdown: Record<string, number>;
}

export default function CompliancePage() {
  const [stats, setStats] = useState<ComplianceStats | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshData = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch(`${BACKEND_URL}/compliance/stats`);
        const data = await res.json();
        setStats(data);
      } catch {
        // Backend might not be running
      }
    }
    fetchStats();
  }, [refreshKey]);

  return (
    <div className="min-h-screen bg-gray-950">
      <nav className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">CP</span>
              </div>
              <span className="text-white font-semibold">ClearPath</span>
            </Link>
            <div className="flex space-x-4">
              <Link
                href="/dashboard"
                className="text-gray-400 hover:text-white transition text-sm"
              >
                Dashboard
              </Link>
              <Link href="/compliance" className="text-white text-sm font-medium">
                Compliance
              </Link>
              <Link
                href="/fx"
                className="text-gray-400 hover:text-white transition text-sm"
              >
                FX Settlement
              </Link>
            </div>
          </div>
          <WalletMultiButton />
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-white mb-8">
          Compliance Console
        </h1>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <p className="text-gray-400 text-xs">Total Whitelisted</p>
              <p className="text-2xl font-bold text-white">
                {stats.totalWhitelisted}
              </p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <p className="text-gray-400 text-xs">Active</p>
              <p className="text-2xl font-bold text-green-400">
                {stats.activeWhitelisted}
              </p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <p className="text-gray-400 text-xs">Sanctioned</p>
              <p className="text-2xl font-bold text-red-400">
                {stats.sanctionedCount}
              </p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <p className="text-gray-400 text-xs">Expired KYC</p>
              <p className="text-2xl font-bold text-yellow-400">
                {stats.expiredCount}
              </p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <p className="text-gray-400 text-xs">Travel Rule Records</p>
              <p className="text-2xl font-bold text-blue-400">
                {stats.totalTravelRuleRecords}
              </p>
            </div>
          </div>
        )}

        {/* KYC Management */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            KYC Onboarding
          </h2>
          <p className="text-gray-400 text-sm mb-4">
            Add or update a wallet&apos;s KYC status on-chain. Only whitelisted wallets can send or receive compliant transfers.
          </p>
          <KycForm onSuccess={refreshData} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Whitelist */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">
              KYC Whitelist Registry
            </h2>
            <ComplianceTable key={refreshKey} />
          </div>

          {/* Travel Rule Log */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">
              Travel Rule Records
            </h2>
            <TravelRuleLog />
          </div>
        </div>
      </main>
    </div>
  );
}
