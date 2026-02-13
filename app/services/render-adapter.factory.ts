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
