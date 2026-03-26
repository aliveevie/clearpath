"use client";

import { FC, useEffect, useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const MINT = new PublicKey("FWSVGnr3ehd9P2nNxwdFwHY88epg6Kc981yinv6DFet1");

interface VaultData {
  address: string;
  institutionId: string;
  authority: string;
  threshold: number;
  totalDeposited: number;
  totalWithdrawn: number;
}

interface Props {
  vault?: VaultData;
}

export const VaultCard: FC<Props> = ({ vault }) => {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    try {
      const ata = getAssociatedTokenAddressSync(
        MINT,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      const info = await connection.getTokenAccountBalance(ata);
      setBalance(Number(info.value.uiAmountString));
    } catch {
      setBalance(0);
    } finally {
      setLoading(false);
    }
  }, [publicKey, connection]);

  useEffect(() => {
    fetchBalance();

    const handleDataChanged = () => {
      // Delay to allow on-chain state to settle after tx confirmation
      setTimeout(fetchBalance, 2000);
    };
    window.addEventListener("clearpath:data-changed", handleDataChanged);
    return () =>
      window.removeEventListener("clearpath:data-changed", handleDataChanged);
  }, [fetchBalance]);

  if (!connected || !publicKey) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-2">Wallet</h3>
        <p className="text-gray-400 text-sm">
          Connect your wallet to view your balance.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Treasury Vault</h3>
        <span className="px-2 py-1 bg-green-900/50 text-green-400 text-xs rounded-full">
          Active
        </span>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-gray-400 text-sm">Balance</p>
          <p className="text-2xl font-bold text-white">
            {loading
              ? "..."
              : (balance ?? 0).toLocaleString()}{" "}
            <span className="text-gray-400 text-sm">USDC</span>
          </p>
        </div>

        <div className="pt-3 border-t border-gray-800">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Network</span>
            <span className="text-gray-300">Devnet</span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-gray-400">Wallet</span>
            <span className="text-gray-500 font-mono text-xs">
              {publicKey.toBase58().slice(0, 8)}...
              {publicKey.toBase58().slice(-4)}
            </span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-gray-400">Mint</span>
            <span className="text-gray-500 font-mono text-xs">
              {MINT.toBase58().slice(0, 8)}...{MINT.toBase58().slice(-4)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
