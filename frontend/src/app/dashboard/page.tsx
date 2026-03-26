"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";
import { VaultCard } from "@/components/VaultCard";
import { TransferForm } from "@/components/TransferForm";
import { TransactionHistory } from "@/components/TransactionHistory";
import { FxRateDisplay } from "@/components/FxRateDisplay";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (mod) => mod.WalletMultiButton
    ),
  { ssr: false }
);

export default function Dashboard() {
  const { connected } = useWallet();

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
              <Link href="/dashboard" className="text-white text-sm font-medium">
                Dashboard
              </Link>
              <Link
                href="/compliance"
                className="text-gray-400 hover:text-white transition text-sm"
              >
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
          Treasury Dashboard
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <VaultCard />

          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-white mb-4">
              Recent Transfers
            </h2>
            <TransactionHistory />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">
              Compliant Transfer
            </h2>
            <TransferForm />
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <FxRateDisplay />
          </div>
        </div>
      </main>
    </div>
  );
}
