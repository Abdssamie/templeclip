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
