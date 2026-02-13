# Render Adapter Pattern Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the Adapter pattern to allow switching between AWS Lambda rendering and Docker-based rendering via environment variable configuration.

**Architecture:** Create a unified `RenderAdapter` interface with two implementations: `LambdaRenderAdapter` (wrapper around existing Lambda service) and `DockerRenderAdapter` (HTTP client for Docker render service). A factory function selects the appropriate adapter based on `ENABLE_DOCKER_RENDER` environment variable.

**Tech Stack:** TypeScript, Adapter Pattern, Environment-based Configuration

---

## Prerequisites

**Docs to review:**

- Plan 1 (Docker Rendering Setup) - must be completed first
- Current Lambda implementation: `app/services/lambda-render.server.ts`
- API route: `app/routes/api.render.tsx`

**Key insight:** The existing Lambda code in `lambda-render.server.ts` is tightly coupled. We'll create adapter interfaces to abstract the rendering mechanism while maintaining backward compatibility.

---

## Task 1: Define Render Adapter Interface

**Files:**

- Create: `app/services/render-adapter.interface.ts`

**Step 1: Create the adapter interface**

```typescript
// app/services/render-adapter.interface.ts

/**
 * Input props for rendering a timeline composition
 */
export interface RenderInput {
  timelineData: unknown[];
  compositionWidth: number;
  compositionHeight: number;
  durationInFrames: number;
  scenes?: unknown[];
  variableValues?: Record<string, string>;
}

/**
 * Render status
 */
export type RenderStatus = "completed" | "failed" | "in_progress";

/**
 * Result of checking render progress
 */
export interface RenderProgressResult {
  done: boolean;
  status: RenderStatus;
  progress: number; // 0-1
  outputFile?: string;
  errors?: string[];
}

/**
 * Result of starting a render job
 */
export interface StartRenderResult {
  renderId: string;
  bucketName: string;
}

/**
 * Render adapter interface - abstracts the rendering mechanism
 * (Lambda vs Docker)
 */
export interface RenderAdapter {
  /**
   * Start a render job
   */
  startRender(input: RenderInput): Promise<StartRenderResult>;

  /**
   * Poll the progress of a render job
   */
  pollRenderProgress(renderId: string, bucketName: string): Promise<RenderProgressResult>;
}

/**
 * Configuration for render adapter factory
 */
export interface RenderAdapterConfig {
  useDocker: boolean;
  dockerUrl?: string;
}
```

**Step 2: Commit**

```bash
git add app/services/render-adapter.interface.ts
git commit -m "feat: define render adapter interface"
```

---

## Task 2: Create Lambda Render Adapter

**Files:**

- Create: `app/services/lambda-render-adapter.ts`
- Test: `app/services/lambda-render-adapter.test.ts`

**Step 1: Create Lambda adapter implementation**

```typescript
// app/services/lambda-render-adapter.ts
import { renderMediaOnLambda, getRenderProgress as getRemotionRenderProgress } from "@remotion/lambda/client";
import { getLambdaConfig } from "~/lib/lambda-config.server";
import type {
  RenderAdapter,
  RenderInput,
  RenderProgressResult,
  RenderStatus,
  StartRenderResult,
} from "./render-adapter.interface";

/**
 * AWS Lambda implementation of RenderAdapter
 */
export class LambdaRenderAdapter implements RenderAdapter {
  /**
   * Validate render input parameters
   */
  private validateRenderInput(input: RenderInput): void {
    if (input.durationInFrames <= 0) {
      throw new Error(`Invalid durationInFrames: ${input.durationInFrames}. Must be a positive number.`);
    }

    if (input.compositionWidth <= 0) {
      throw new Error(`Invalid compositionWidth: ${input.compositionWidth}. Must be a positive number.`);
    }

    if (input.compositionHeight <= 0) {
      throw new Error(`Invalid compositionHeight: ${input.compositionHeight}. Must be a positive number.`);
    }

    if (!Array.isArray(input.timelineData)) {
      throw new Error("Invalid timelineData: Must be an array.");
    }
  }

  /**
   * Validate render progress parameters
   */
  private validateProgressParams(renderId: string, bucketName: string): void {
    if (!renderId || renderId.trim() === "") {
      throw new Error("Invalid renderId: Must not be empty.");
    }

    if (!bucketName || bucketName.trim() === "") {
      throw new Error("Invalid bucketName: Must not be empty.");
    }
  }

  /**
   * Map Remotion errors to string array
   */
  private mapErrors(errors: Array<{ message: string }> | undefined): string[] | undefined {
    if (!errors || errors.length === 0) {
      return undefined;
    }
    return errors.map((e) => e.message);
  }

  /**
   * Validate domain format
   */
  private isValidDomain(domain: string): boolean {
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return domainRegex.test(domain.trim());
  }

  /**
   * Get webhook URL for render completion notifications
   */
  private getWebhookUrl(): string | undefined {
    const config = getLambdaConfig();
    const prodDomain = config.prodDomain;

    if (!prodDomain) {
      console.warn("PROD_DOMAIN not set - webhook notifications will not be configured");
      return undefined;
    }

    if (!this.isValidDomain(prodDomain)) {
      console.error(`Invalid PROD_DOMAIN format: ${prodDomain} - webhook notifications will not be configured`);
      return undefined;
    }

    return `https://${prodDomain}/api/webhooks/render-complete`;
  }

  /**
   * Start a Lambda render job
   */
  async startRender(input: RenderInput): Promise<StartRenderResult> {
    this.validateRenderInput(input);

    const config = getLambdaConfig();
    const webhookUrl = this.getWebhookUrl();

    try {
      const result = await renderMediaOnLambda({
        region: config.region,
        functionName: config.functionName,
        serveUrl: config.serveUrl,
        composition: "TimelineComposition",
        inputProps: {
          timelineData: input.timelineData,
          compositionWidth: input.compositionWidth,
          compositionHeight: input.compositionHeight,
          durationInFrames: input.durationInFrames,
          scenes: input.scenes,
          variableValues: input.variableValues,
        },
        codec: "h264",
        imageFormat: "jpeg",
        maxRetries: 1,
        privacy: "public",
        framesPerLambda: 20,
        webhook: webhookUrl
          ? {
              url: webhookUrl,
              secret: config.webhookSecret || null,
            }
          : undefined,
      });

      return {
        renderId: result.renderId,
        bucketName: result.bucketName,
      };
    } catch (error) {
      throw new Error(`Failed to start Lambda render: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }
  }

  /**
   * Check the progress of a Lambda render job
   */
  async pollRenderProgress(renderId: string, bucketName: string): Promise<RenderProgressResult> {
    this.validateProgressParams(renderId, bucketName);

    const config = getLambdaConfig();

    try {
      const progress = await getRemotionRenderProgress({
        renderId,
        bucketName,
        functionName: config.functionName,
        region: config.region,
      });

      const errors = this.mapErrors(progress.errors);

      if (progress.done) {
        const status: RenderStatus = errors && errors.length > 0 ? "failed" : "completed";

        return {
          done: true,
          status,
          progress: 1,
          outputFile: progress.outputFile || undefined,
          errors,
        };
      }

      return {
        done: false,
        status: "in_progress",
        progress: progress.overallProgress,
        errors,
      };
    } catch (error) {
      throw new Error(`Failed to get render progress: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }
  }
}
```

**Step 2: Create unit test**

```typescript
// app/services/lambda-render-adapter.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LambdaRenderAdapter } from "./lambda-render-adapter";
import * as lambdaConfig from "~/lib/lambda-config.server";

vi.mock("@remotion/lambda/client", () => ({
  renderMediaOnLambda: vi.fn(),
  getRenderProgress: vi.fn(),
}));

vi.mock("~/lib/lambda-config.server", () => ({
  getLambdaConfig: vi.fn(),
}));

describe("LambdaRenderAdapter", () => {
  let adapter: LambdaRenderAdapter;

  beforeEach(() => {
    adapter = new LambdaRenderAdapter();
    vi.mocked(lambdaConfig.getLambdaConfig).mockReturnValue({
      region: "us-east-1",
      functionName: "test-function",
      serveUrl: "https://test.s3.amazonaws.com",
      bucketName: "test-bucket",
      awsAccessKeyId: "test-key",
      awsSecretAccessKey: "test-secret",
    });
  });

  describe("startRender", () => {
    it("should throw error for invalid duration", async () => {
      await expect(
        adapter.startRender({
          timelineData: [],
          compositionWidth: 1920,
          compositionHeight: 1080,
          durationInFrames: 0,
        }),
      ).rejects.toThrow("Invalid durationInFrames");
    });

    it("should throw error for negative width", async () => {
      await expect(
        adapter.startRender({
          timelineData: [],
          compositionWidth: -100,
          compositionHeight: 1080,
          durationInFrames: 30,
        }),
      ).rejects.toThrow("Invalid compositionWidth");
    });
  });

  describe("pollRenderProgress", () => {
    it("should throw error for empty renderId", async () => {
      await expect(adapter.pollRenderProgress("", "bucket")).rejects.toThrow("Invalid renderId");
    });

    it("should throw error for empty bucketName", async () => {
      await expect(adapter.pollRenderProgress("render-123", "")).rejects.toThrow("Invalid bucketName");
    });
  });
});
```

**Step 3: Run tests**

```bash
pnpm test app/services/lambda-render-adapter.test.ts
```

Expected: All tests pass

**Step 4: Commit**

```bash
git add app/services/lambda-render-adapter.ts app/services/lambda-render-adapter.test.ts
git commit -m "feat: create Lambda render adapter implementation"
```

---

## Task 3: Create Docker Render Adapter

**Files:**

- Create: `app/services/docker-render-adapter.ts`
- Test: `app/services/docker-render-adapter.test.ts`

**Step 1: Create Docker adapter implementation**

```typescript
// app/services/docker-render-adapter.ts
import type {
  RenderAdapter,
  RenderInput,
  RenderProgressResult,
  RenderStatus,
  StartRenderResult,
} from "./render-adapter.interface";

interface DockerRenderJob {
  renderId: string;
  bucketName: string; // Always "docker-local" for consistency
}

interface DockerProgressResponse {
  done: boolean;
  status: RenderStatus;
  progress: number;
  outputFile?: string;
  errors?: string[];
}

/**
 * Docker-based implementation of RenderAdapter
 * Communicates with the Docker render service via HTTP
 */
export class DockerRenderAdapter implements RenderAdapter {
  private baseUrl: string;

  constructor(baseUrl: string = process.env.RENDER_SERVER_URL || "http://localhost:8080") {
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
  }

  /**
   * Validate render input parameters
   */
  private validateRenderInput(input: RenderInput): void {
    if (input.durationInFrames <= 0) {
      throw new Error(`Invalid durationInFrames: ${input.durationInFrames}. Must be a positive number.`);
    }

    if (input.compositionWidth <= 0) {
      throw new Error(`Invalid compositionWidth: ${input.compositionWidth}. Must be a positive number.`);
    }

    if (input.compositionHeight <= 0) {
      throw new Error(`Invalid compositionHeight: ${input.compositionHeight}. Must be a positive number.`);
    }

    if (!Array.isArray(input.timelineData)) {
      throw new Error("Invalid timelineData: Must be an array.");
    }
  }

  /**
   * Validate render progress parameters
   */
  private validateProgressParams(renderId: string, bucketName: string): void {
    if (!renderId || renderId.trim() === "") {
      throw new Error("Invalid renderId: Must not be empty.");
    }

    if (!bucketName || bucketName.trim() === "") {
      throw new Error("Invalid bucketName: Must not be empty.");
    }
  }

  /**
   * Start a render job on the Docker render service
   */
  async startRender(input: RenderInput): Promise<StartRenderResult> {
    this.validateRenderInput(input);

    try {
      const response = await fetch(`${this.baseUrl}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timelineData: input.timelineData,
          compositionWidth: input.compositionWidth,
          compositionHeight: input.compositionHeight,
          durationInFrames: input.durationInFrames,
          scenes: input.scenes,
          variableValues: input.variableValues,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Docker render service error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      return {
        renderId: data.renderId,
        bucketName: "docker-local", // Docker doesn't use S3 buckets
      };
    } catch (error) {
      if (error instanceof TypeError && error.message.includes("fetch failed")) {
        throw new Error(
          `Cannot connect to Docker render service at ${this.baseUrl}. ` +
            "Ensure the render service is running (docker-compose up render)",
          { cause: error },
        );
      }
      throw new Error(`Failed to start Docker render: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }
  }

  /**
   * Poll the progress of a Docker render job
   */
  async pollRenderProgress(renderId: string, bucketName: string): Promise<RenderProgressResult> {
    this.validateProgressParams(renderId, bucketName);

    try {
      const response = await fetch(`${this.baseUrl}/render/${encodeURIComponent(renderId)}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Render job not found: ${renderId}`);
        }
        const errorText = await response.text();
        throw new Error(`Docker render service error: ${response.status} - ${errorText}`);
      }

      const data = (await response.json()) as DockerProgressResponse;

      return {
        done: data.done,
        status: data.status,
        progress: data.progress,
        outputFile: data.outputFile,
        errors: data.errors,
      };
    } catch (error) {
      if (error instanceof TypeError && error.message.includes("fetch failed")) {
        throw new Error(
          `Cannot connect to Docker render service at ${this.baseUrl}. ` +
            "Ensure the render service is running (docker-compose up render)",
          { cause: error },
        );
      }
      throw new Error(`Failed to get render progress: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }
  }
}
```

**Step 2: Create unit test with mocked fetch**

```typescript
// app/services/docker-render-adapter.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DockerRenderAdapter } from "./docker-render-adapter";

describe("DockerRenderAdapter", () => {
  let adapter: DockerRenderAdapter;
  const mockFetch = vi.fn();

  beforeEach(() => {
    adapter = new DockerRenderAdapter("http://localhost:8080");
    global.fetch = mockFetch;
    vi.clearAllMocks();
  });

  describe("startRender", () => {
    it("should throw error for invalid duration", async () => {
      await expect(
        adapter.startRender({
          timelineData: [],
          compositionWidth: 1920,
          compositionHeight: 1080,
          durationInFrames: 0,
        }),
      ).rejects.toThrow("Invalid durationInFrames");
    });

    it("should start render successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ renderId: "job-123" }),
      });

      const result = await adapter.startRender({
        timelineData: [],
        compositionWidth: 1920,
        compositionHeight: 1080,
        durationInFrames: 30,
      });

      expect(result.renderId).toBe("job-123");
      expect(result.bucketName).toBe("docker-local");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8080/render",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    it("should throw error when service is unavailable", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

      await expect(
        adapter.startRender({
          timelineData: [],
          compositionWidth: 1920,
          compositionHeight: 1080,
          durationInFrames: 30,
        }),
      ).rejects.toThrow("Cannot connect to Docker render service");
    });
  });

  describe("pollRenderProgress", () => {
    it("should throw error for empty renderId", async () => {
      await expect(adapter.pollRenderProgress("", "bucket")).rejects.toThrow("Invalid renderId");
    });

    it("should return progress successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          done: false,
          status: "in_progress",
          progress: 0.5,
        }),
      });

      const result = await adapter.pollRenderProgress("job-123", "docker-local");

      expect(result.done).toBe(false);
      expect(result.status).toBe("in_progress");
      expect(result.progress).toBe(0.5);
    });

    it("should throw error for 404 response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "Not found",
      });

      await expect(adapter.pollRenderProgress("job-123", "docker-local")).rejects.toThrow("Render job not found");
    });
  });
});
```

**Step 3: Run tests**

```bash
pnpm test app/services/docker-render-adapter.test.ts
```

Expected: All tests pass

**Step 4: Commit**

```bash
git add app/services/docker-render-adapter.ts app/services/docker-render-adapter.test.ts
git commit -m "feat: create Docker render adapter implementation"
```

---

## Task 4: Create Render Adapter Factory

**Files:**

- Create: `app/services/render-adapter.factory.ts`
- Test: `app/services/render-adapter.factory.test.ts`

**Step 1: Create factory function**

```typescript
// app/services/render-adapter.factory.ts
import { LambdaRenderAdapter } from "./lambda-render-adapter";
import { DockerRenderAdapter } from "./docker-render-adapter";
import type { RenderAdapter, RenderAdapterConfig } from "./render-adapter.interface";

/**
 * Create a render adapter based on configuration
 */
export function createRenderAdapter(config?: RenderAdapterConfig): RenderAdapter {
  const useDocker = config?.useDocker ?? process.env.ENABLE_DOCKER_RENDER === "true";

  if (useDocker) {
    const dockerUrl = config?.dockerUrl ?? process.env.RENDER_SERVER_URL ?? "http://localhost:8080";
    console.log(`[RenderAdapter] Using Docker render service at ${dockerUrl}`);
    return new DockerRenderAdapter(dockerUrl);
  } else {
    console.log("[RenderAdapter] Using AWS Lambda rendering");
    return new LambdaRenderAdapter();
  }
}

/**
 * Get the current render adapter configuration
 */
export function getRenderAdapterConfig(): RenderAdapterConfig {
  return {
    useDocker: process.env.ENABLE_DOCKER_RENDER === "true",
    dockerUrl: process.env.RENDER_SERVER_URL,
  };
}
```

**Step 2: Create factory tests**

```typescript
// app/services/render-adapter.factory.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRenderAdapter, getRenderAdapterConfig } from "./render-adapter.factory";
import { LambdaRenderAdapter } from "./lambda-render-adapter";
import { DockerRenderAdapter } from "./docker-render-adapter";

describe("createRenderAdapter", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should create Lambda adapter by default", () => {
    delete process.env.ENABLE_DOCKER_RENDER;
    const adapter = createRenderAdapter();
    expect(adapter).toBeInstanceOf(LambdaRenderAdapter);
  });

  it("should create Docker adapter when ENABLE_DOCKER_RENDER=true", () => {
    process.env.ENABLE_DOCKER_RENDER = "true";
    process.env.RENDER_SERVER_URL = "http://render:8080";
    const adapter = createRenderAdapter();
    expect(adapter).toBeInstanceOf(DockerRenderAdapter);
  });

  it("should use config over environment variables", () => {
    process.env.ENABLE_DOCKER_RENDER = "false";
    const adapter = createRenderAdapter({ useDocker: true, dockerUrl: "http://custom:8080" });
    expect(adapter).toBeInstanceOf(DockerRenderAdapter);
  });

  it("should use default URL when RENDER_SERVER_URL not set", () => {
    process.env.ENABLE_DOCKER_RENDER = "true";
    delete process.env.RENDER_SERVER_URL;
    const adapter = createRenderAdapter();
    expect(adapter).toBeInstanceOf(DockerRenderAdapter);
  });
});

describe("getRenderAdapterConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return config from environment", () => {
    process.env.ENABLE_DOCKER_RENDER = "true";
    process.env.RENDER_SERVER_URL = "http://render:8080";

    const config = getRenderAdapterConfig();

    expect(config.useDocker).toBe(true);
    expect(config.dockerUrl).toBe("http://render:8080");
  });

  it("should return default config when env not set", () => {
    delete process.env.ENABLE_DOCKER_RENDER;
    delete process.env.RENDER_SERVER_URL;

    const config = getRenderAdapterConfig();

    expect(config.useDocker).toBe(false);
    expect(config.dockerUrl).toBeUndefined();
  });
});
```

**Step 3: Run tests**

```bash
pnpm test app/services/render-adapter.factory.test.ts
```

Expected: All tests pass

**Step 4: Commit**

```bash
git add app/services/render-adapter.factory.ts app/services/render-adapter.factory.test.ts
git commit -m "feat: create render adapter factory"
```

---

## Task 5: Update API Route to Use Adapter

**Files:**

- Modify: `app/routes/api.render.tsx`

**Step 1: Update imports and replace Lambda-specific calls**

Replace lines 1-7:

```typescript
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { requireUserId } from "~/lib/auth.utils";
import { createRenderAdapter } from "~/services/render-adapter.factory";
import type { RenderInput } from "~/services/render-adapter.interface";
import { getProjectScenes } from "~/lib/projects.repo";
import { applyElasticityToTimeline } from "~/utils/elasticity";
import { buildTimelineFromScenes, type SceneRenderRequest } from "~/utils/timeline-builder.server";
import { resolveR2UrlsInTimeline } from "~/utils/resolve-r2-urls.server";
```

**Step 2: Replace Lambda render calls with adapter**

Replace lines 96-110:

```typescript
// Create render adapter based on environment
const adapter = createRenderAdapter();

// Start render
const result = await adapter.startRender({
  timelineData: resolvedTimelineData,
  compositionWidth,
  compositionHeight,
  durationInFrames: finalDurationInFrames,
  scenes: projectScenes,
  variableValues: mergedVariables,
});

return Response.json({
  renderId: result.renderId,
  bucketName: result.bucketName,
});
```

Replace lines 145-154:

```typescript
// Create render adapter
const adapter = createRenderAdapter();

// Start render (validation happens in the adapter)
const result = await adapter.startRender(renderInput);

return Response.json({
  renderId: result.renderId,
  bucketName: result.bucketName,
});
```

Replace lines 203-206:

```typescript
// Create render adapter
const adapter = createRenderAdapter();

// Poll render progress (validation happens in the adapter)
const progress = await adapter.pollRenderProgress(renderId, bucketName);

return Response.json(progress);
```

**Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: No errors

**Step 4: Commit**

```bash
git add app/routes/api.render.tsx
git commit -m "refactor: use render adapter in API route"
```

---

## Task 6: Create Integration Test

**Files:**

- Create: `scripts/test-render-adapter.sh`

**Step 1: Create integration test script**

```bash
#!/bin/bash
# scripts/test-render-adapter.sh

set -e

echo "=== Testing Render Adapter ==="

# Test 1: Lambda mode (default)
echo -e "\n1. Testing Lambda adapter (default)..."
ENABLE_DOCKER_RENDER=false pnpm vitest run app/services/render-adapter.factory.test.ts --reporter=verbose

# Test 2: Docker mode
echo -e "\n2. Testing Docker adapter..."
ENABLE_DOCKER_RENDER=true RENDER_SERVER_URL=http://localhost:8080 pnpm vitest run app/services/docker-render-adapter.test.ts --reporter=verbose

echo -e "\n=== All tests passed! ==="
```

Make executable: `chmod +x scripts/test-render-adapter.sh`

**Step 2: Run integration test**

```bash
./scripts/test-render-adapter.sh
```

Expected: All tests pass

**Step 3: Commit**

```bash
git add scripts/test-render-adapter.sh
git commit -m "test: add render adapter integration tests"
```

---

## Task 7: Documentation

**Files:**

- Create: `docs/architecture/render-adapter-pattern.md`

**Step 1: Write architecture documentation**

```markdown
# Render Adapter Pattern

## Overview

The render adapter pattern provides a unified interface for video rendering that supports multiple backends:

- **AWS Lambda** - Cloud-based serverless rendering
- **Docker** - Local/self-hosted rendering with headless Chrome

## Architecture
```

┌─────────────────┐
│ API Route │
│ api.render.tsx │
└────────┬────────┘
│
│ createRenderAdapter()
▼
┌─────────────────┐
│ RenderAdapter │
│ (Interface) │
└────────┬────────┘
│
┌────┴────┐
▼ ▼
┌────────┐ ┌────────┐
│ Lambda │ │ Docker │
│Adapter │ │Adapter │
└────────┘ └────────┘

````

## Configuration

Switch between adapters using environment variables:

```bash
# Use AWS Lambda (default)
ENABLE_DOCKER_RENDER=false

# Use Docker rendering
ENABLE_DOCKER_RENDER=true
RENDER_SERVER_URL=http://localhost:8080
````

## Usage

```typescript
import { createRenderAdapter } from "~/services/render-adapter.factory";

// Automatic selection based on environment
const adapter = createRenderAdapter();

// Or explicit selection
const adapter = createRenderAdapter({
  useDocker: true,
  dockerUrl: "http://render:8080",
});

// Use the adapter (same interface for both)
const result = await adapter.startRender(input);
const progress = await adapter.pollRenderProgress(renderId, bucketName);
```

## When to Use Each Adapter

### Lambda Adapter

- **Pros**: Scalable, managed infrastructure, pay-per-use
- **Cons**: Cold start latency, requires AWS setup
- **Best for**: Production, variable workloads, large-scale rendering

### Docker Adapter

- **Pros**: Local development, no cloud costs, predictable performance
- **Cons**: Requires local resources, manual scaling
- **Best for**: Development, testing, on-premise deployments

## Implementation Details

Both adapters implement the same `RenderAdapter` interface:

- `startRender(input: RenderInput): Promise<StartRenderResult>`
- `pollRenderProgress(renderId: string, bucketName: string): Promise<RenderProgressResult>`

The Lambda adapter wraps the existing `@remotion/lambda` client.
The Docker adapter communicates via HTTP to the render service.

````

**Step 2: Commit**

```bash
git add docs/architecture/render-adapter-pattern.md
git commit -m "docs: add render adapter pattern documentation"
````

---

## Task 8: Deprecate Old Lambda Service (Optional Cleanup)

**Files:**

- Modify: `app/services/lambda-render.server.ts`

**Step 1: Mark old service as deprecated**

Add deprecation notice at the top:

```typescript
/**
 * @deprecated Use `LambdaRenderAdapter` from `lambda-render-adapter.ts` instead.
 * This file is kept for backward compatibility but will be removed in a future version.
 */
```

**Step 2: Commit**

```bash
git add app/services/lambda-render.server.ts
git commit -m "chore: mark lambda-render.server.ts as deprecated"
```

---

## Summary

This plan implements a complete adapter pattern for rendering:

1. **Interface** (`render-adapter.interface.ts`) - Common contract
2. **Lambda Adapter** (`lambda-render-adapter.ts`) - AWS Lambda implementation
3. **Docker Adapter** (`docker-render-adapter.ts`) - Docker service implementation
4. **Factory** (`render-adapter.factory.ts`) - Environment-based selection
5. **Integration** - Updated `api.render.tsx` to use adapter
6. **Tests** - Unit tests for all adapters
7. **Documentation** - Architecture and usage guide

**Key Benefits:**

- Zero breaking changes to existing API
- Easy switching between Lambda and Docker via env var
- Clean separation of concerns
- Testable with mocked dependencies

**Environment Variables:**

- `ENABLE_DOCKER_RENDER=true|false` - Switch rendering mode
- `RENDER_SERVER_URL` - Docker service URL (when using Docker mode)
