import type express from "express";
import { CONFIG } from "./config";

export function authenticateToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!CONFIG.API_TOKEN) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized - Bearer token required" });
  }

  const token = authHeader.substring(7);
  if (token !== CONFIG.API_TOKEN) {
    return res.status(401).json({ error: "Unauthorized - Invalid token" });
  }

  next();
}
