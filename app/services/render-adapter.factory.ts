// app/services/render-adapter.factory.ts
import { DockerRenderAdapter } from "./docker-render-adapter";
import type { RenderAdapter, RenderAdapterConfig } from "./render-adapter.interface";

/**
 * Create a render adapter
 * Always returns Docker render adapter (Lambda support removed)
 */
export function createRenderAdapter(config?: RenderAdapterConfig): RenderAdapter {
  const dockerUrl = config?.dockerUrl ?? process.env.RENDER_SERVER_URL ?? "http://localhost:8080";
  console.log(`[RenderAdapter] Using Docker render service at ${dockerUrl}`);
  return new DockerRenderAdapter(dockerUrl);
}

/**
 * Get the current render adapter configuration
 */
export function getRenderAdapterConfig(): RenderAdapterConfig {
  return {
    dockerUrl: process.env.RENDER_SERVER_URL,
  };
}
