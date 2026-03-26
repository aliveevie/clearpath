"use client";

import { useMemo } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import hookIdl from "@/lib/idl/clearpath_hook.json";
import treasuryIdl from "@/lib/idl/clearpath_treasury.json";

export function useAnchorProvider() {
  const { connection } = useConnection();
  const wallet = useWallet();

  return useMemo(() => {
    if (!wallet.publicKey) return null;
    return new AnchorProvider(connection, wallet as any, {
      commitment: "confirmed",
    });
  }, [connection, wallet]);
}

export function useHookProgram() {
  const provider = useAnchorProvider();
  return useMemo(() => {
    if (!provider) return null;
    return new Program(hookIdl as any, provider);
  }, [provider]);
}

export function useTreasuryProgram() {
  const provider = useAnchorProvider();
  return useMemo(() => {
    if (!provider) return null;
    return new Program(treasuryIdl as any, provider);
  }, [provider]);
}
