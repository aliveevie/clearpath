"use client";

import { FC, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { BACKEND_URL, TRAVEL_RULE_THRESHOLD } from "@/lib/constants";

export const TransferForm: FC = () => {
  const { publicKey, connected, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [targetCurrency, setTargetCurrency] = useState("CHF");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connected || !publicKey || !sendTransaction) {
      setStatus("Please connect your wallet first.");
      return;
    }

    setLoading(true);
    setStatus("Building compliant transfer...");

    try {
      // Step 1: Ask backend to build the transaction (admin setup + serialized tx)
      const buildRes = await fetch(`${BACKEND_URL}/transfers/build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderWallet: publicKey.toBase58(),
          recipientWallet: recipient,
          amount,
          targetCurrency,
        }),
      });
      const buildData = await buildRes.json();
      if (!buildRes.ok) {
        throw new Error(buildData.error || "Failed to build transaction.");
      }

      // Step 2: Deserialize the tx, refresh blockhash so it's fresh for signing
      setStatus("Please approve the transaction in your wallet...");
      const tx = Transaction.from(
        Buffer.from(buildData.transaction, "base64")
      );

      // Get a fresh blockhash right before sending (avoids expiry during wallet approval)
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;

      const signature = await sendTransaction(tx, connection, {
        skipPreflight: false,
      });

      // Step 3: Confirm with extended timeout for devnet
      setStatus("Confirming on-chain...");
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      // Step 4: Notify backend of confirmed transfer
      await fetch(`${BACKEND_URL}/transfers/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature,
          sender: publicKey.toBase58(),
        }),
      }).catch(() => {}); // non-critical

      const travelRuleMsg = buildData.travelRuleApplies
        ? " Travel Rule record created."
        : "";

      setStatus(
        `Transfer confirmed! ${amount} USDC sent. Signature: ${signature.slice(0, 16)}...${travelRuleMsg}`
      );
      window.dispatchEvent(new Event("clearpath:data-changed"));
    } catch (err: any) {
      if (err.message?.includes("User rejected")) {
        setStatus("Transaction cancelled by user.");
      } else {
        // Extract detailed logs from SendTransactionError if available
        const logs = err?.logs?.join("\n") || err?.message || "Unknown error";
        setStatus(`Error: ${logs}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-gray-400 text-sm mb-1">
          Recipient Address
        </label>
        <input
          type="text"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="Solana wallet address"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-gray-400 text-sm mb-1">
            Amount (USDC)
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            min="0"
            step="0.01"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            required
          />
        </div>
        <div>
          <label className="block text-gray-400 text-sm mb-1">
            Target Currency
          </label>
          <select
            value={targetCurrency}
            onChange={(e) => setTargetCurrency(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
          >
            <option value="CHF">CHF</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
        </div>
      </div>

      {parseFloat(amount) >= TRAVEL_RULE_THRESHOLD && (
        <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-3">
          <p className="text-yellow-400 text-sm">
            This transfer exceeds the Travel Rule threshold ({TRAVEL_RULE_THRESHOLD} USDC).
            Encrypted sender/receiver metadata will be recorded on-chain.
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !connected}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-3 rounded-lg transition"
      >
        {loading
          ? "Processing..."
          : connected
          ? "Submit Compliant Transfer"
          : "Connect Wallet to Transfer"}
      </button>

      {status && (
        <div className="bg-gray-800 rounded-lg p-3">
          <p className="text-gray-300 text-sm">{status}</p>
        </div>
      )}
    </form>
  );
};
