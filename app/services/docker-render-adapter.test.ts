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
