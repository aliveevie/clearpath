"use client";

import Link from "next/link";
import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (mod) => mod.WalletMultiButton
    ),
  { ssr: false }
);

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-950">
      {/* Navigation */}
      <nav className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">CP</span>
            </div>
            <span className="text-white font-semibold text-lg">ClearPath</span>
          </div>

          <div className="flex items-center space-x-6">
            <Link
              href="/dashboard"
              className="text-gray-400 hover:text-white transition text-sm"
            >
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
            <WalletMultiButton />
          </div>
        </div>
      </nav>

      {/* Hero */}
      <main className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-white mb-4">
            Compliance-Native
            <br />
            <span className="text-blue-400">Cross-Border Treasury</span>
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto mb-8">
            Built on Solana Token-2022 Transfer Hooks. KYC, AML, and Travel Rule
            enforced at the protocol level — not the application layer.
            Un-bypassable by design.
          </p>

          <div className="flex justify-center space-x-4 mb-16">
            <Link
              href="/dashboard"
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition"
            >
              Open Dashboard
            </Link>
            <Link
              href="/compliance"
              className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-6 py-3 rounded-lg font-medium transition"
            >
              Compliance Console
            </Link>
          </div>

          {/* Feature cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <div className="w-10 h-10 bg-green-900/50 rounded-lg flex items-center justify-center mb-4">
                <span className="text-green-400 text-xl">&#x2713;</span>
              </div>
              <h3 className="text-white font-semibold mb-2">
                Protocol-Level Compliance
              </h3>
              <p className="text-gray-400 text-sm">
                Token-2022 Transfer Hooks enforce KYC/AML checks on every
                transfer. No front-end bypass possible — compliance runs at the
                Solana runtime level.
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <div className="w-10 h-10 bg-blue-900/50 rounded-lg flex items-center justify-center mb-4">
                <span className="text-blue-400 text-xl">&#x21C4;</span>
              </div>
              <h3 className="text-white font-semibold mb-2">
                FX-Settled Transfers
              </h3>
              <p className="text-gray-400 text-sm">
                Cross-border transfers settle in target currency using live FX
                rates from SIX BFI. Oracle-fed, on-chain rate verification.
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <div className="w-10 h-10 bg-purple-900/50 rounded-lg flex items-center justify-center mb-4">
                <span className="text-purple-400 text-xl">&#x1F512;</span>
              </div>
              <h3 className="text-white font-semibold mb-2">
                Travel Rule On-Chain
              </h3>
              <p className="text-gray-400 text-sm">
                Transfers above threshold auto-record encrypted sender/receiver
                PII to on-chain PDAs. Only authorized VASPs can decrypt — no
                central database.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 px-6 py-6 mt-auto">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-sm text-gray-500">
          <span>ClearPath Protocol — StableHacks 2026</span>
          <span>Solana Token-2022 | SIX BFI | Fireblocks</span>
        </div>
      </footer>
    </div>
  );
}
