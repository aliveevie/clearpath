import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { config } from "./config";
import { initPrograms } from "./services/solana";
import { startFxRateUpdater } from "./services/fx-adapter";
import kycRoutes from "./routes/kyc";
import fxRoutes from "./routes/fx";
import treasuryRoutes from "./routes/treasury";
import complianceRoutes from "./routes/compliance";
import transferRoutes from "./routes/transfers";

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "clearpath-backend",
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use("/kyc", kycRoutes);
app.use("/fx", fxRoutes);
app.use("/treasury", treasuryRoutes);
app.use("/compliance", complianceRoutes);
app.use("/transfers", transferRoutes);

// Start server
async function start() {
  try {
    // Initialize Anchor program clients
    initPrograms();
    console.log("Solana program clients initialized");

    // Start FX rate updater (every 60 seconds)
    startFxRateUpdater(60_000);
    console.log("FX rate updater started");

    app.listen(config.port, () => {
      console.log(`ClearPath Backend running on port ${config.port}`);
      console.log(`Health check: http://localhost:${config.port}/health`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

start();
