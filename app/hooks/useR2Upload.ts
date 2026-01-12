import { useState, useCallback } from "react";
import axios, { type CancelTokenSource } from "axios";
import { apiUrl } from "~/utils/api";

export interface R2UploadProgress {
    assetId: string;
    filename: string;
    progress: number; // 0-100
    status: "pending" | "uploading" | "confirming" | "completed" | "failed";
    error?: string;
}

export interface R2UploadResult {
    success: boolean;
    assetId: string;
    r2Key: string;
    asset?: {
        id: string;
        originalName: string;
        mimeType: string;
        sizeBytes: number;
        r2Key: string;
        width?: number;
        height?: number;
        durationSeconds?: number;
    };
    error?: string;
}

export interface UseR2UploadOptions {
    onProgress?: (progress: R2UploadProgress) => void;
    onComplete?: (result: R2UploadResult) => void;
    onError?: (error: string) => void;
}

/**
 * Hook for uploading files to Cloudflare R2
 * 
 * Flow:
 * 1. Request presigned upload URL from backend
 * 2. Upload file directly to R2 using presigned URL
 * 3. Confirm upload completion with backend
 * 
 * @param options - Upload callbacks
 * @returns Upload functions and state
 */
export function useR2Upload(options?: UseR2UploadOptions) {
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<Record<string, R2UploadProgress>>({});
    const [cancelTokens, setCancelTokens] = useState<Record<string, CancelTokenSource>>({});

    /**
     * Upload a file to R2
     * 
     * @param file - File to upload
     * @param metadata - Additional metadata (width, height, duration, projectId)
     * @returns Upload result
     */
    const uploadFile = useCallback(
        async (
            file: File,
            metadata?: {
                width?: number;
                height?: number;
                durationSeconds?: number;
                projectId?: string;
            }
        ): Promise<R2UploadResult> => {
            const tempId = `temp-${Date.now()}-${Math.random()}`;
            const cancelSource = axios.CancelToken.source();

            setCancelTokens((prev) => ({ ...prev, [tempId]: cancelSource }));
            setUploading(true);

            const updateProgress = (update: Partial<R2UploadProgress>) => {
                const progress: R2UploadProgress = {
                    ...uploadProgress[tempId],
                    ...update,
                    assetId: tempId,
                    filename: file.name,
                    progress: 0,
                    status: "pending",
                };

                setUploadProgress((prev) => ({ ...prev, [tempId]: progress }));
                options?.onProgress?.(progress);
            };

            try {
                updateProgress({ status: "pending", progress: 0 });

                // Step 1: Request presigned upload URL
                const presignedResponse = await axios.post(
                    apiUrl("/r2/presigned-upload"),
                    {
                        filename: file.name,
                        mimeType: file.type,
                        sizeBytes: file.size,
                        ...metadata,
                    },
                    {
                        withCredentials: true,
                        cancelToken: cancelSource.token,
                    }
                );

                const { presignedUrl, assetId, r2Key } = presignedResponse.data;

                updateProgress({ assetId, status: "uploading", progress: 0 });

                // Step 2: Upload file directly to R2
                await axios.put(presignedUrl, file, {
                    headers: {
                        "Content-Type": file.type,
                    },
                    onUploadProgress: (progressEvent) => {
                        const percentCompleted = progressEvent.total
                            ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
                            : 0;
                        updateProgress({ progress: percentCompleted });
                    },
                    cancelToken: cancelSource.token,
                });

                updateProgress({ status: "confirming", progress: 100 });

                // Step 3: Confirm upload completion
                const confirmResponse = await axios.post(
                    apiUrl("/r2/confirm-upload"),
                    { assetId },
                    {
                        withCredentials: true,
                        cancelToken: cancelSource.token,
                    }
                );

                const result: R2UploadResult = {
                    success: true,
                    assetId,
                    r2Key,
                    asset: confirmResponse.data.asset,
                };

                updateProgress({ status: "completed", progress: 100 });
                options?.onComplete?.(result);

                // Cleanup
                setCancelTokens((prev) => {
                    const { [tempId]: _, ...rest } = prev;
                    return rest;
                });
                setUploadProgress((prev) => {
                    const { [tempId]: _, ...rest } = prev;
                    return rest;
                });

                return result;
            } catch (error: any) {
                const errorMessage = axios.isCancel(error)
                    ? "Upload cancelled"
                    : error.response?.data?.error || error.message || "Upload failed";

                updateProgress({ status: "failed", error: errorMessage });
                options?.onError?.(errorMessage);

                // Cleanup on error
                setCancelTokens((prev) => {
                    const { [tempId]: _, ...rest } = prev;
                    return rest;
                });

                return {
                    success: false,
                    assetId: tempId,
                    r2Key: "",
                    error: errorMessage,
                };
            } finally {
                setUploading(false);
            }
        },
        [uploadProgress, options]
    );

    /**
     * Cancel an ongoing upload
     * 
     * @param assetId - Asset ID or temp ID of upload to cancel
     */
    const cancelUpload = useCallback((assetId: string) => {
        const cancelToken = cancelTokens[assetId];
        if (cancelToken) {
            cancelToken.cancel("Upload cancelled by user");
            setCancelTokens((prev) => {
                const { [assetId]: _, ...rest } = prev;
                return rest;
            });
        }
    }, [cancelTokens]);

    /**
     * Cancel all ongoing uploads
     */
    const cancelAllUploads = useCallback(() => {
        Object.values(cancelTokens).forEach((token) => {
            token.cancel("All uploads cancelled");
        });
        setCancelTokens({});
        setUploadProgress({});
    }, [cancelTokens]);

    return {
        uploadFile,
        cancelUpload,
        cancelAllUploads,
        uploading,
        uploadProgress,
    };
}
