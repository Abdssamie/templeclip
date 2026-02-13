import { useState, useCallback, useRef, useEffect } from "react";
import axios from "axios";
import type { TimelineDataItem } from "~/components/timeline/types";

export const useRenderer = () => {
  const [isRendering, setIsRendering] = useState(false);
  const [renderStatus, setRenderStatus] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

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
      setIsRendering(true);
      setRenderStatus("Starting render...");
      setProgress(0);

      try {
        // Start render
        const response = await axios.post("/api/render", {
          projectId,
          scenes,
          compositionWidth,
          compositionHeight,
          applyElasticity: applyElasticity !== false, // Default to true
        });

        const { renderId, bucketName } = response.data;
        if (!renderId || !bucketName) {
          throw new Error("Invalid response from render API: missing renderId or bucketName");
        }

        // Poll progress
        pollIntervalRef.current = setInterval(async () => {
          try {
            const progressRes = await axios.get(`/api/render?renderId=${renderId}&bucketName=${bucketName}`);
            const { done, status, progress: renderProgress, outputFile, errors } = progressRes.data;

            setRenderStatus(`Rendering: ${Math.round(renderProgress || 0)}%`);
            setProgress(Math.round(renderProgress || 0));

            if (done) {
              clearInterval(pollIntervalRef.current!);
              pollIntervalRef.current = null;
              if (status === "completed" && outputFile) {
                // Trigger download
                const link = document.createElement("a");
                link.href = outputFile;
                link.setAttribute("download", "rendered-video.mp4");
                document.body.appendChild(link);
                link.click();
                link.remove();
                setRenderStatus("Video rendered and downloaded successfully!");
              } else {
                setRenderStatus(`Error: ${errors?.join(", ") || "Render failed"}`);
              }
              setIsRendering(false);
            }
          } catch (error) {
            clearInterval(pollIntervalRef.current!);
            pollIntervalRef.current = null;
            setRenderStatus("Error: Failed to check render progress");
            setIsRendering(false);
          }
        }, 2000);
      } catch (error) {
        console.error("Render error:", error);
        if (axios.isAxiosError(error)) {
          setRenderStatus(`Error: ${error.response?.data?.message || error.message || "Failed to start render"}`);
        } else {
          setRenderStatus("Error: Unknown rendering error occurred");
        }
        setIsRendering(false);
      }
    },
    [],
  );

  const handleRenderTimeline = useCallback(
    async (
      timelineData: TimelineDataItem[],
      compositionWidth: number,
      compositionHeight: number,
      durationInFrames: number,
    ) => {
      setIsRendering(true);
      setRenderStatus("Starting render...");
      setProgress(0);

      try {
        // Start render using legacy timeline-based API path
        const response = await axios.post("/api/render", {
          timelineData,
          compositionWidth,
          compositionHeight,
          durationInFrames,
        });

        const { renderId, bucketName } = response.data;
        if (!renderId || !bucketName) {
          throw new Error("Invalid response from render API: missing renderId or bucketName");
        }

        // Poll progress (reuse same polling logic as handleRenderVideo)
        pollIntervalRef.current = setInterval(async () => {
          try {
            const progressRes = await axios.get(`/api/render?renderId=${renderId}&bucketName=${bucketName}`);
            const { done, status, progress: renderProgress, outputFile, errors } = progressRes.data;

            setRenderStatus(`Rendering: ${Math.round(renderProgress || 0)}%`);
            setProgress(Math.round(renderProgress || 0));

            if (done) {
              clearInterval(pollIntervalRef.current!);
              pollIntervalRef.current = null;
              if (status === "completed" && outputFile) {
                // Trigger download
                const link = document.createElement("a");
                link.href = outputFile;
                link.setAttribute("download", "rendered-video.mp4");
                document.body.appendChild(link);
                link.click();
                link.remove();
                setRenderStatus("Video rendered and downloaded successfully!");
              } else {
                setRenderStatus(`Error: ${errors?.join(", ") || "Render failed"}`);
              }
              setIsRendering(false);
            }
          } catch (error) {
            clearInterval(pollIntervalRef.current!);
            pollIntervalRef.current = null;
            setRenderStatus("Error: Failed to check render progress");
            setIsRendering(false);
          }
        }, 2000);
      } catch (error) {
        console.error("Render error:", error);
        if (axios.isAxiosError(error)) {
          setRenderStatus(`Error: ${error.response?.data?.message || error.message || "Failed to start render"}`);
        } else {
          setRenderStatus("Error: Unknown rendering error occurred");
        }
        setIsRendering(false);
      }
    },
    [],
  );

  return {
    isRendering,
    renderStatus,
    progress,
    handleRenderVideo,
    handleRenderTimeline,
  };
};
