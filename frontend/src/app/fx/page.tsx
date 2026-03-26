"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { FxRateDisplay } from "@/components/FxRateDisplay";
import { useFxRates } from "@/hooks/useFxRate";
import { BACKEND_URL } from "@/lib/constants";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (mod) => mod.WalletMultiButton
    ),
  { ssr: false }
);

export default function FxPage() {
  const { rates } = useFxRates();
  const { publicKey, connected, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [amount, setAmount] = useState("");
  const [pair, setPair] = useState("USDCHF");
  const [settling, setSettling] = useState(false);
  const [settleStatus, setSettleStatus] = useState<string | null>(null);

  const selectedRate = rates.find((r) => r.pair === pair);
  const convertedAmount = selectedRate
    ? (parseFloat(amount || "0") * selectedRate.rate).toFixed(2)
    : "0.00";

  const targetCurrency = pair.slice(3);

  const handleSettle = async () => {
    if (!connected || !publicKey || !sendTransaction) {
      setSettleStatus("Connect your wallet first.");
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      setSettleStatus("Enter a valid amount.");
      return;
    }

    setSettling(true);
    setSettleStatus("Building FX settlement transaction...");

    try {
      const res = await fetch(`${BACKEND_URL}/fx/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderWallet: publicKey.toBase58(),
          recipientWallet: publicKey.toBase58(),
          amount,
          targetCurrency,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSettleStatus("Approve the transaction in your wallet...");
      const tx = Transaction.from(Buffer.from(data.transaction, "base64"));
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;

      const signature = await sendTransaction(tx, connection, {
        skipPreflight: false,
      });

      setSettleStatus("Confirming on-chain...");
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      setSettleStatus(
        `Settlement confirmed! ${amount} USDC → ${data.settledAmount} ${targetCurrency} at rate ${data.rate}`
      );
      window.dispatchEvent(new Event("clearpath:data-changed"));
    } catch (err: any) {
      if (err.message?.includes("User rejected")) {
        setSettleStatus("Transaction cancelled.");
      } else {
        setSettleStatus(`Error: ${err.message}`);
      }
    } finally {
      setSettling(false);
    }
  };

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
              <Link
                href="/compliance"
                className="text-gray-400 hover:text-white transition text-sm"
              >
                Compliance
              </Link>
              <Link href="/fx" className="text-white text-sm font-medium">
                FX Settlement
              </Link>
            </div>
          </div>
          <WalletMultiButton />
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-white mb-8">
          FX Settlement
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* FX Rates */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <FxRateDisplay />
            <div className="mt-6 pt-4 border-t border-gray-800">
              <p className="text-gray-400 text-sm">
                Rates sourced from SIX BFI (Swiss Financial Information). Updated
                every 60 seconds and pushed on-chain to FX Config PDAs for
                settlement verification.
              </p>
            </div>
          </div>

          {/* FX Calculator */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              Settlement Calculator
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-gray-400 text-sm mb-1">
                  USDC Amount
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter USDC amount"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-lg placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-1">
                  Target Currency
                </label>
                <select
                  value={pair}
                  onChange={(e) => setPair(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="USDCHF">CHF (Swiss Franc)</option>
                  <option value="USDEUR">EUR (Euro)</option>
                  <option value="USDGBP">GBP (British Pound)</option>
                </select>
              </div>

              <div className="bg-gray-800 rounded-lg p-4">
                <p className="text-gray-400 text-sm">Settlement Amount</p>
                <p className="text-3xl font-bold text-white">
                  {convertedAmount}{" "}
                  <span className="text-gray-400 text-lg">
                    {pair.slice(3)}
                  </span>
                </p>
                {selectedRate && (
                  <p className="text-gray-500 text-xs mt-1">
                    Rate: 1 {pair.slice(0, 3)} = {selectedRate.rate.toFixed(6)}{" "}
                    {pair.slice(3)}
                  </p>
                )}
              </div>

              <button
                onClick={handleSettle}
                disabled={settling || !connected || !amount}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-3 rounded-lg transition"
              >
                {settling
                  ? "Processing..."
                  : connected
                  ? "Execute FX Settlement"
                  : "Connect Wallet to Settle"}
              </button>

              {settleStatus && (
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className={`text-sm ${settleStatus.startsWith("Error") ? "text-red-400" : settleStatus.includes("confirmed") ? "text-green-400" : "text-gray-300"}`}>
                    {settleStatus}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
