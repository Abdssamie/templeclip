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
