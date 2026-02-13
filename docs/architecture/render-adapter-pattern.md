# Render Adapter Pattern

## Overview

The render adapter pattern provides a unified interface for video rendering that supports multiple backends:

- **AWS Lambda** - Cloud-based serverless rendering
- **Docker** - Local/self-hosted rendering with headless Chrome

## Architecture

```
┌─────────────────┐
│   API Route     │
│ api.render.tsx  │
└────────┬────────┘
         │
         │ createRenderAdapter()
         ▼
┌─────────────────┐
│  RenderAdapter  │
│   (Interface)   │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌────────┐
│ Lambda │ │ Docker │
│Adapter │ │Adapter │
└────────┘ └────────┘
```

## Configuration

Switch between adapters using environment variables:

```bash
# Use AWS Lambda (default)
ENABLE_DOCKER_RENDER=false

# Use Docker rendering
ENABLE_DOCKER_RENDER=true
RENDER_SERVER_URL=http://localhost:8080
```

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
