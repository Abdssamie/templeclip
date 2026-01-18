import { useState, useCallback, useEffect } from "react";
import axios from "axios";
import { type MediaBinItem, type ScrubberState } from "~/components/timeline/types";
import { generateUUID } from "~/utils/uuid";
import { apiUrl } from "~/utils/api";
import { AssetsResponseSchema } from "~/schemas";

// Delete media file from server
export const deleteMediaFile = async (
  filename: string,
): Promise<{ success: boolean; message?: string; error?: string }> => {
  try {
    const response = await fetch(apiUrl(`/media/${encodeURIComponent(filename)}`), {
      method: "DELETE",
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to delete file");
    }

    return await response.json();
  } catch (error) {
    console.error("Delete API error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
};

// Clone/copy media file on server
export const cloneMediaFile = async (
  filename: string,
  originalName: string,
  suffix: string,
): Promise<{
  success: boolean;
  filename?: string;
  originalName?: string;
  url?: string;
  fullUrl?: string;
  size?: number;
  error?: string;
}> => {
  try {
    const response = await fetch(apiUrl("/clone-media"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filename,
        originalName,
        suffix,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to clone file");
    }

    return await response.json();
  } catch (error) {
    console.error("Clone API error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
};

// Helper function to get media metadata
const getMediaMetadata = (
  file: File,
  mediaType: "video" | "image" | "audio",
): Promise<{
  durationInSeconds?: number;
  width: number;
  height: number;
}> => {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);

    if (mediaType === "video") {
      const video = document.createElement("video");
      video.preload = "metadata";

      video.onloadedmetadata = () => {
        const width = video.videoWidth;
        const height = video.videoHeight;
        const durationInSeconds = video.duration;

        URL.revokeObjectURL(url);
        resolve({
          durationInSeconds: isFinite(durationInSeconds) ? durationInSeconds : undefined,
          width,
          height,
        });
      };

      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load video metadata"));
      };

      video.src = url;
    } else if (mediaType === "image") {
      const img = new Image();

      img.onload = () => {
        const width = img.naturalWidth;
        const height = img.naturalHeight;

        URL.revokeObjectURL(url);
        resolve({
          durationInSeconds: undefined, // Images don't have duration
          width,
          height,
        });
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load image metadata"));
      };

      img.src = url;
    } else if (mediaType === "audio") {
      const audio = document.createElement("audio");
      audio.preload = "metadata";

      audio.onloadedmetadata = () => {
        const durationInSeconds = audio.duration;

        URL.revokeObjectURL(url);
        resolve({
          durationInSeconds: isFinite(durationInSeconds) ? durationInSeconds : undefined,
          width: 0, // Audio files don't have visual dimensions
          height: 0,
        });
      };

      audio.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load audio metadata"));
      };

      audio.src = url;
    }
  });
};

export const useMediaBin = (handleDeleteScrubbersByMediaBinId: (mediaBinId: string) => void) => {
  const [mediaBinItems, setMediaBinItems] = useState<MediaBinItem[]>([]);
  const [isMediaLoading, setIsMediaLoading] = useState<boolean>(true);
  const projectId = (() => {
    try {
      const m = window.location.pathname.match(/\/project\/([^/]+)/);
      return m ? m[1] : null;
    } catch {
      return null;
    }
  })();
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: MediaBinItem;
  } | null>(null);

  // Hydrate existing assets for the logged-in user and project
  useEffect(() => {
    const loadAssets = async () => {
      try {
        const url = projectId ? `/api/assets?projectId=${encodeURIComponent(projectId)}` : "/api/assets";
        const res = await fetch(apiUrl(url, false, true), {
          credentials: "include",
        });
        if (!res.ok) {
          console.warn("Failed to load assets:", res.status);
          return;
        }
        const json = await res.json();
        const parsed = AssetsResponseSchema.safeParse(json);
        const assets = parsed.success ? parsed.data.assets : [];
        const items: MediaBinItem[] = assets.map((a) => ({
          id: a.id,
          name: a.name,
          mediaType: ((): "video" | "image" | "audio" | "text" => {
            const ext = a.name.toLowerCase();
            if (/(mp4|mov|webm|mkv|avi)$/.test(ext)) return "video";
            if (/(mp3|wav|aac|ogg|flac)$/.test(ext)) return "audio";
            if (/(jpg|jpeg|png|gif|bmp|webp)$/.test(ext)) return "image";
            return "image";
          })(),
          mediaUrlLocal: null, // Will be populated after R2 download
          mediaUrlRemote: a.mediaUrlRemote,
          durationInSeconds: a.durationInSeconds ?? 0,
          media_width: a.width ?? 0,
          media_height: a.height ?? 0,
          text: null,
          assetId: a.id,
          r2Key: a.r2_key || null,
          publicUrl: a.r2_key ? `/r2/${a.r2_key}` : null,
          isUploading: false,
          uploadProgress: null,
          left_transition_id: null,
          right_transition_id: null,
          groupped_scrubbers: null,
        }));
        // Merge: keep existing text items, replace non-text items with fetched assets
        setMediaBinItems((prev) => {
          const textItems = prev.filter((i) => i.mediaType === "text");
          return [...textItems, ...items];
        });
        console.log(`Loaded ${items.length} assets for project ${projectId || "default"}`);
      } catch (e) {
        console.error("Failed to load assets", e);
      } finally {
        setIsMediaLoading(false);
      }
    };
    loadAssets();
  }, [projectId]);

  const handleAddMediaToBin = useCallback(
    async (file: File) => {
      const tempId = generateUUID();
      const name = file.name;
      let mediaType: "video" | "image" | "audio";
      if (file.type.startsWith("video/")) mediaType = "video";
      else if (file.type.startsWith("image/")) mediaType = "image";
      else if (file.type.startsWith("audio/")) mediaType = "audio";
      else {
        alert("Unsupported file type. Please select a video or image.");
        return;
      }

      console.log("Adding to bin:", name, mediaType);

      try {
        // Create local blob URL for immediate preview
        const mediaUrlLocal = URL.createObjectURL(file);

        console.log(`Parsing ${mediaType} file for metadata...`);
        const metadata = await getMediaMetadata(file, mediaType);
        console.log("Media metadata:", metadata);

        // Add item to media bin immediately with upload progress tracking
        const newItem: MediaBinItem = {
          id: tempId,
          name,
          mediaType,
          mediaUrlLocal,
          mediaUrlRemote: null,
          durationInSeconds: metadata.durationInSeconds ?? 0,
          media_width: metadata.width,
          media_height: metadata.height,
          text: null,
          assetId: null, // Will be set after R2 upload
          r2Key: null,
          publicUrl: null,
          isUploading: true,
          uploadProgress: 0,
          left_transition_id: null,
          right_transition_id: null,
          groupped_scrubbers: null,
        };
        setMediaBinItems((prev) => [...prev, newItem]);

        // Upload to R2 using useR2Upload hook
        const formData = new FormData();
        formData.append("media", file);

        console.log("Uploading file to R2...");

        // Use R2 presigned upload
        const presignedRes = await axios.post(
          apiUrl("/api/r2/presigned-upload", false, true),
          {
            filename: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
            width: metadata.width,
            height: metadata.height,
            durationSeconds: metadata.durationInSeconds || 0,
            projectId: projectId || "",
          },
          { withCredentials: true },
        );

        const { presignedUrl, assetId, r2Key } = presignedRes.data;

        // Upload directly to R2
        await axios.put(presignedUrl, file, {
          headers: { "Content-Type": file.type },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              console.log(`Upload progress: ${percentCompleted}%`);
              setMediaBinItems((prev) =>
                prev.map((item) => (item.id === tempId ? { ...item, uploadProgress: percentCompleted } : item)),
              );
            }
          },
        });

        // Confirm upload
        await axios.post(apiUrl("/api/r2/confirm-upload", false, true), { assetId }, { withCredentials: true });

        console.log("Upload successful to R2");

        // Update item with R2 data
        setMediaBinItems((prev) =>
          prev.map((item) =>
            item.id === tempId
              ? {
                  ...item,
                  id: assetId,
                  assetId,
                  r2Key,
                  publicUrl: `/r2/${r2Key}`,
                  isUploading: false,
                  uploadProgress: null,
                }
              : item,
          ),
        );
      } catch (error) {
        console.error("Error adding media to bin:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        // Remove the failed item from media bin
        setMediaBinItems((prev) => prev.filter((item) => item.id !== tempId));

        throw new Error(`Failed to add media: ${errorMessage}`);
      }
    },
    [projectId],
  );

  const handleAddTextToBin = useCallback(
    (
      textContent: string,
      fontSize: number,
      fontFamily: string,
      color: string,
      textAlign: "left" | "center" | "right",
      fontWeight: "normal" | "bold",
    ) => {
      const newItem: MediaBinItem = {
        id: generateUUID(),
        name: textContent,
        mediaType: "text",
        media_width: 0,
        media_height: 0,
        text: {
          textContent,
          fontSize,
          fontFamily,
          color,
          textAlign,
          fontWeight,
          template: null, // for now, maybe we can also allow text to have a template (same ones from captions)
        },
        mediaUrlLocal: null,
        mediaUrlRemote: null,
        durationInSeconds: 0, // interesting code. i wish i remembered why i did this. maybe there's a better way.
        assetId: null, // Text items don't have assets
        r2Key: null,
        publicUrl: null,
        isUploading: false,
        uploadProgress: null,
        left_transition_id: null,
        right_transition_id: null,
        groupped_scrubbers: null,
      };
      setMediaBinItems((prev) => [...prev, newItem]);
    },
    [],
  );

  const getMediaBinItems = useCallback(() => mediaBinItems, [mediaBinItems]);

  const setTextItems = useCallback((textItems: MediaBinItem[]) => {
    setMediaBinItems((prev) => {
      const withoutText = prev.filter((i) => i.mediaType !== "text");
      return [
        ...withoutText,
        ...textItems.map(
          (t): MediaBinItem => ({
            ...t,
            mediaType: "text" as const,
            mediaUrlLocal: null,
            mediaUrlRemote: null,
            assetId: null,
            r2Key: null,
            publicUrl: null,
            isUploading: false,
            uploadProgress: null,
          }),
        ),
      ];
    });
  }, []);

  const handleDeleteMedia = useCallback(
    async (item: MediaBinItem) => {
      try {
        // For text and grouped scrubbers, which are UI-only constructs, just remove them from the local state.
        if (item.mediaType === "text" || item.mediaType === "groupped_scrubber") {
          setMediaBinItems((prev) => prev.filter((binItem) => binItem.id !== item.id));
          if (handleDeleteScrubbersByMediaBinId) {
            handleDeleteScrubbersByMediaBinId(item.id);
          }
          return; // Exit early as there's no backend asset to delete.
        }

        // For other media types, call the authenticated delete endpoint.
        const assetId = item.id;
        const res = await fetch(apiUrl(`/api/assets/${assetId}`, false, true), {
          method: "DELETE",
          credentials: "include",
        });

        if (res.ok) {
          console.log(`Media deleted: ${item.name}`);
          // On successful backend deletion, remove the item from the UI state.
          setMediaBinItems((prev) => prev.filter((binItem) => binItem.id !== item.id));
          if (handleDeleteScrubbersByMediaBinId) {
            handleDeleteScrubbersByMediaBinId(item.id);
          }
        } else {
          console.error("Failed to delete media:", await res.text());
        }
      } catch (error) {
        console.error("Error deleting media:", error);
      }
    },
    [handleDeleteScrubbersByMediaBinId],
  );

  const handleSplitAudio = useCallback(async (videoItem: MediaBinItem) => {
    if (videoItem.mediaType !== "video") {
      throw new Error("Can only split audio from video files");
    }

    try {
      // Extract filename from mediaUrlRemote URL
      if (!videoItem.mediaUrlRemote) {
        throw new Error("No remote URL found for video item");
      }

      // Clone via authenticated API (server will copy within out/ and record)
      const res = await fetch(apiUrl(`/api/assets/${videoItem.id}/clone`, false, true), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suffix: "(Audio)" }),
      });
      if (!res.ok) throw new Error("Failed to clone media file");
      const cloneResult = await res.json();

      // Create a new audio media item using returned URL
      const audioItem: MediaBinItem = {
        id: generateUUID(),
        name: `${videoItem.name} (Audio)`,
        mediaType: "audio",
        mediaUrlLocal: videoItem.mediaUrlLocal, // Reuse the original video's blob URL
        mediaUrlRemote: cloneResult.asset?.mediaUrlRemote!,
        durationInSeconds: videoItem.durationInSeconds,
        media_width: 0, // Audio doesn't have visual dimensions
        media_height: 0,
        text: null,
        assetId: cloneResult.asset?.id || null,
        r2Key: null, // TODO: Will be populated when R2 is integrated
        publicUrl: null,
        isUploading: false,
        uploadProgress: null,
        left_transition_id: null,
        right_transition_id: null,
        groupped_scrubbers: null,
      };

      // Add the audio item to the media bin
      setMediaBinItems((prev) => [...prev, audioItem]);
      setContextMenu(null); // Close context menu after action

      console.log(`Audio split successful: ${videoItem.name} -> ${audioItem.name}`);
    } catch (error) {
      console.error("Error splitting audio:", error);
      throw error;
    }
  }, []);

  // Handle right-click to show context menu
  const handleContextMenu = useCallback((e: React.MouseEvent, item: MediaBinItem) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      item,
    });
  }, []);

  // Handle context menu actions
  const handleDeleteFromContext = useCallback(async () => {
    if (!contextMenu) return;
    await handleDeleteMedia(contextMenu.item);
    setContextMenu(null);
  }, [contextMenu, handleDeleteMedia]);

  const handleSplitAudioFromContext = useCallback(async () => {
    if (!contextMenu) return;
    await handleSplitAudio(contextMenu.item);
  }, [contextMenu, handleSplitAudio]);

  // Close context menu when clicking outside
  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleAddGroupToMediaBin = useCallback((groupedScrubber: ScrubberState, currentPixelsPerSecond: number) => {
    // Calculate the actual duration in seconds by dividing the current pixel width
    // by the current zoom-adjusted pixels per second - this gives us the true duration
    // regardless of zoom level
    const actualDurationInSeconds = groupedScrubber.width / currentPixelsPerSecond;

    // Create a new media bin item from the grouped scrubber
    const newItem: MediaBinItem = {
      id: groupedScrubber.id,
      name: groupedScrubber.name || "Grouped Media",
      mediaType: "groupped_scrubber",
      mediaUrlLocal: null,
      mediaUrlRemote: null,
      durationInSeconds: actualDurationInSeconds,
      media_width: groupedScrubber.media_width || 0,
      media_height: groupedScrubber.media_height || 0,
      text: null,
      assetId: groupedScrubber.assetId || null,
      r2Key: groupedScrubber.r2Key || null,
      publicUrl: groupedScrubber.publicUrl || null,
      isUploading: false,
      uploadProgress: null,
      left_transition_id: null,
      right_transition_id: null,
      groupped_scrubbers: groupedScrubber.groupped_scrubbers,
    };

    setMediaBinItems((prev) => [...prev, newItem]);
    console.log("Added grouped scrubber to media bin:", newItem.name);
  }, []);

  return {
    mediaBinItems,
    isMediaLoading,
    getMediaBinItems,
    setTextItems,
    handleAddMediaToBin,
    handleAddTextToBin,
    handleDeleteMedia,
    handleSplitAudio,
    handleAddGroupToMediaBin,
    contextMenu,
    handleContextMenu,
    handleDeleteFromContext,
    handleSplitAudioFromContext,
    handleCloseContextMenu,
  };
};
