import { useState, useCallback, useRef, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import type { TimelineDataItem } from "~/components/timeline/types";

export const useRenderer = () => {
  const [isRendering, setIsRendering] = useState(false);
  const toastIdRef = useRef<string | number | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const showDownloadToast = useCallback((outputFile: string) => {
    // Update existing toast to download state
    toastIdRef.current = toast.success("Render complete! Click to download", {
      id: toastIdRef.current || undefined,
      duration: Infinity,
      action: {
        label: "Download",
        onClick: () => {
          // Fetch as blob to trigger save dialog
          fetch(outputFile)
            .then((res) => res.blob())
            .then((blob) => {
              const blobUrl = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = blobUrl;
              link.download = "rendered-video.mp4";
              document.body.appendChild(link);
              link.click();
              link.remove();
              URL.revokeObjectURL(blobUrl);
              toast.dismiss(toastIdRef.current!);
              window.dispatchEvent(new Event("exports-updated"));
            })
            .catch((err) => {
              console.error("Download failed:", err);
              toast.error("Failed to download video");
            });
        },
      },
      onDismiss: () => {
        window.dispatchEvent(new Event("exports-updated"));
      },
    });
  }, []);

  const startRender = useCallback(
    async (renderPayload: object, label: string) => {
      setIsRendering(true);

      // Show initial progress toast
      toastIdRef.current = toast.loading(`Starting ${label}...`, {
        duration: Infinity,
      });

      try {
        const response = await axios.post("/api/render", renderPayload);
        const { renderId, bucketName } = response.data;

        if (!renderId || !bucketName) {
          throw new Error("Invalid response from render API");
        }

        // Poll progress
        pollIntervalRef.current = setInterval(async () => {
          try {
            const progressRes = await axios.get(`/api/render?renderId=${renderId}&bucketName=${bucketName}`);
            const { done, status, progress: renderProgress, outputFile, errors } = progressRes.data;

            if (!done) {
              // Update toast with progress
              toast.loading(`Rendering: ${Math.round(renderProgress || 0)}%`, {
                id: toastIdRef.current!,
                duration: Infinity,
              });
            } else {
              clearInterval(pollIntervalRef.current!);
              pollIntervalRef.current = null;

              if (status === "completed" && outputFile) {
                showDownloadToast(outputFile);
              } else {
                toast.error(`Error: ${errors?.join(", ") || "Render failed"}`, {
                  id: toastIdRef.current!,
                });
                window.dispatchEvent(new Event("exports-updated"));
              }
              setIsRendering(false);
            }
          } catch (error) {
            clearInterval(pollIntervalRef.current!);
            pollIntervalRef.current = null;
            toast.error("Error: Failed to check render progress", {
              id: toastIdRef.current!,
            });
            setIsRendering(false);
            window.dispatchEvent(new Event("exports-updated"));
          }
        }, 2000);
      } catch (error) {
        console.error("Render error:", error);
        const message = axios.isAxiosError(error)
          ? error.response?.data?.message || error.message
          : "Unknown rendering error";
        toast.error(`Error: ${message}`, { id: toastIdRef.current! });
        setIsRendering(false);
        window.dispatchEvent(new Event("exports-updated"));
      }
    },
    [showDownloadToast],
  );

  const handleRenderVideo = useCallback(
    async (
      projectId: string,
      scenes: Array<{
        sceneId: string;
        variables: Record<string, string>;
        duration?: number;
      }>,
      compositionWidth: number,
      compositionHeight: number,
      applyElasticity?: boolean,
    ) => {
      const sceneNames = scenes.map((s) => s.sceneId).join(", ");
      const label = scenes.length === 1 ? "scene" : `${scenes.length} scenes`;

      await startRender(
        {
          projectId,
          scenes,
          compositionWidth,
          compositionHeight,
          applyElasticity: applyElasticity !== false,
        },
        label,
      );
    },
    [startRender],
  );

  const handleRenderTimeline = useCallback(
    async (
      timelineData: TimelineDataItem[],
      compositionWidth: number,
      compositionHeight: number,
      durationInFrames: number,
    ) => {
      await startRender(
        {
          timelineData,
          compositionWidth,
          compositionHeight,
          durationInFrames,
        },
        "timeline",
      );
    },
    [startRender],
  );

  return {
    isRendering,
    handleRenderVideo,
    handleRenderTimeline,
  };
};
