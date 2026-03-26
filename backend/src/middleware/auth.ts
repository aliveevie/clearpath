import { Request, Response, NextFunction } from "express";

/**
 * Webhook signature verification middleware.
 * In production, this verifies Sumsub/Synaps webhook signatures.
 * For hackathon demo, accepts an API key header.
 */
export function verifyWebhookSignature(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const apiKey = req.headers["x-api-key"];

  // In production: verify HMAC signature from KYC provider
  // For demo: accept any request or check basic API key
  if (process.env.NODE_ENV === "production" && !apiKey) {
    return res.status(401).json({ error: "Unauthorized — missing API key" });
  }

  next();
}

/**
 * Admin authorization middleware.
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const apiKey = req.headers["x-api-key"];

  if (process.env.NODE_ENV === "production" && apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({ error: "Forbidden — admin access required" });
  }

  next();
}
