"use client";

import { useState, useEffect, useCallback } from "react";
import { BACKEND_URL } from "@/lib/constants";

interface FxRate {
  pair: string;
  rate: number;
  rateRaw: number;
  lastUpdated: string;
}

export function useFxRates() {
  const [rates, setRates] = useState<FxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRates = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/fx`);
      if (!res.ok) throw new Error("Failed to fetch FX rates");
      const data = await res.json();
      setRates(data.rates);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRates();
    const interval = setInterval(fetchRates, 30_000);
    return () => clearInterval(interval);
  }, [fetchRates]);

  return { rates, loading, error, refresh: fetchRates };
}
