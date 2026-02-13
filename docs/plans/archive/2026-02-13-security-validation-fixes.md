# Security & Validation Fixes - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add authentication, request validation, rate limiting, and input size limits to prevent abuse.

**Architecture:** Use Zod for validation, Bearer token auth, in-memory rate limiting, and body size limits.

**Tech Stack:** Zod, Express middleware, environment variables

---

## Task 1: Create Render Request Schema

**Files:**

- Create: `app/schemas/apis/render.ts`

**Step 1:** Define Zod schema for render requests

```typescript
import { z } from "zod";

export const RenderRequestSchema = z.object({
  timelineData: z.array(z.record(z.any())).max(1000, "Timeline too large (max 1000 items)"),
  scenes: z.array(z.record(z.any())).max(100, "Too many scenes (max 100)"),
  width: z.number().int().min(320).max(3840).default(1920),
  height: z.number().int().min(240).max(2160).default(1080),
  durationInSeconds: z.number().positive().max(3600, "Video too long (max 1 hour)"),
  outputFormat: z.enum(["mp4", "webm"]).default("mp4"),
});

export type RenderRequest = z.infer<typeof RenderRequestSchema>;
```

---

## Task 2: Add Request Validation Middleware

**Files:**

- Modify: `app/services/render-server.ts:40-60`

**Step 1:** Replace direct type casting with Zod validation

```typescript
import { RenderRequestSchema } from "~/schemas/apis/render";

app.post("/render", async (req, res) => {
  try {
    // Validate request body
    const result = RenderRequestSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: "Invalid request data",
        details: result.error.issues,
      });
    }

    const { timelineData, scenes, width, height, durationInSeconds, outputFormat } = result.data;
    // ... rest of render logic
  } catch (error) {
    // Don't leak internal error details
    console.error("[Render Error]", error);
    return res.status(500).json({
      error: "Internal server error",
    });
  }
});
```

---

## Task 3: Add Bearer Token Authentication

**Files:**

- Modify: `app/services/render-server.ts:15-30`
- Modify: `.env.example`

**Step 1:** Add auth middleware

```typescript
const RENDER_API_TOKEN = process.env.RENDER_API_TOKEN;

if (!RENDER_API_TOKEN) {
  console.warn("[Warning] RENDER_API_TOKEN not set - render service is insecure!");
}

function authenticateToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!RENDER_API_TOKEN) {
    return next(); // Skip auth if no token configured (development)
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized - Bearer token required" });
  }

  const token = authHeader.substring(7);
  if (token !== RENDER_API_TOKEN) {
    return res.status(401).json({ error: "Unauthorized - Invalid token" });
  }

  next();
}

// Apply to render endpoint
app.post("/render", authenticateToken, async (req, res) => {
  // ... existing handler
});
```

**Step 2:** Add to .env.example

```bash
# Render Service Security
RENDER_API_TOKEN=your_secure_random_token_here
```

---

## Task 4: Implement Rate Limiting

**Files:**

- Modify: `app/services/render-server.ts:10-25`

**Step 1:** use a rate limiting library with redis to configure rate limits

The following code is just for reference. You should use a production grade npm package and install it with pnpm

```typescript
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimits = new Map<string, RateLimitEntry>();
const RATE_LIMIT_REQUESTS = 10; // 10 requests
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // per hour

function rateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  // Get client identifier (IP or forwarded IP)
  const clientId = (req.headers["x-forwarded-for"] as string) || req.ip || "unknown";
  const now = Date.now();

  const entry = rateLimits.get(clientId);
  if (!entry || now > entry.resetTime) {
    // New window
    rateLimits.set(clientId, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS,
    });
    return next();
  }

  if (entry.count >= RATE_LIMIT_REQUESTS) {
    return res.status(429).json({
      error: "Rate limit exceeded",
      retryAfter: Math.ceil((entry.resetTime - now) / 1000),
    });
  }

  entry.count++;
  next();
}

// Apply rate limiting to render endpoint
app.post("/render", rateLimit, authenticateToken, async (req, res) => {
  // ... handler
});
```

---

## Task 5: Add Body Size Limits

**Files:**

- Modify: `app/services/render-server.ts:8-12`

**Step 1:** Limit request body size

```typescript
// Limit JSON body to 10MB
app.use(express.json({ limit: "10mb" }));
app.use(cors());
```

---

## Task 6: Commit Changes

```bash
git add app/schemas/apis/render.ts app/services/render-server.ts .env.example
git commit -m "feat: add security and validation to render service

- Add Zod schema validation for render requests
- Implement Bearer token authentication
- Add rate limiting (10 requests/hour per IP)
- Limit request body size to 10MB
- Sanitize error responses to prevent info leakage"
```
