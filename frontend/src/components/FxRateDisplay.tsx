"use client";

import { FC } from "react";
import { useFxRates } from "@/hooks/useFxRate";

export const FxRateDisplay: FC = () => {
  const { rates, loading, error, refresh } = useFxRates();

  if (loading) {
    return <div className="text-gray-400 p-4">Loading FX rates...</div>;
  }

  if (error) {
    return (
      <div className="text-red-400 p-4">
        Failed to load rates. Is the backend running?
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Live FX Rates</h3>
        <button
          onClick={refresh}
          className="px-3 py-1 text-sm bg-gray-800 text-gray-300 rounded hover:bg-gray-700 transition"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {rates.map((rate) => (
          <div
            key={rate.pair}
            className="bg-gray-900 border border-gray-800 rounded-lg p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">{rate.pair}</span>
              <span className="text-xs text-gray-500">
                via SIX BFI
              </span>
            </div>
            <p className="text-2xl font-bold text-white">
              {rate.rate.toFixed(6)}
            </p>
            <p className="text-gray-500 text-xs mt-1">
              Updated: {new Date(rate.lastUpdated).toLocaleTimeString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
