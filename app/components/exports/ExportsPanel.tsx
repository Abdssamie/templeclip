import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Film, Download, Trash2, Loader2, MoreVertical } from "lucide-react";
import { ExportCard } from "./ExportCard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Button } from "~/components/ui/button";
import { toast } from "sonner";

interface Export {
  id: string;
  label: string | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  created_at: string;
  render_status: string;
}

interface ExportsPanelProps {
  projectId: string;
}

export function ExportsPanel({ projectId }: ExportsPanelProps) {
  const [exports, setExports] = useState<Export[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  const fetchExports = useCallback(async () => {
    try {
      const response = await axios.get(`/api/exports?projectId=${projectId}`);
      setExports(response.data.exports);
    } catch (error) {
      console.error("Failed to fetch exports:", error);
      toast.error("Failed to load exports");
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchExports();
  }, [fetchExports]);

  // Listen for exports-updated event
  useEffect(() => {
    const handleRefresh = () => fetchExports();
    window.addEventListener("exports-updated", handleRefresh);
    return () => window.removeEventListener("exports-updated", handleRefresh);
  }, [fetchExports]);

  const handleDownload = async (url: string, filename: string) => {
    setIsDownloading(filename);
    try {
      // Fetch as blob to avoid redirect
      const response = await axios.get(url, {
        responseType: "blob",
      });

      // Create blob URL and trigger download
      const blob = new Blob([response.data], { type: "video/mp4" });
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();

      // Clean up blob URL after a delay
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

      toast.success("Video download started");
    } catch (error) {
      console.error("Download failed:", error);
      toast.error("Failed to download video");
    } finally {
      setIsDownloading(null);
    }
  };

  const handleDelete = async (exportId: string) => {
    try {
      await axios.delete("/api/exports", {
        data: { exportId },
      });
      setExports((prev) => prev.filter((e) => e.id !== exportId));
      toast.success("Export deleted");
    } catch (error) {
      console.error("Delete failed:", error);
      toast.error("Failed to delete export");
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (exports.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <Film className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="font-medium text-sm mb-2">No exports yet</h3>
        <p className="text-sm text-muted-foreground">
          Click the <strong>Export</strong> button in the header to render your video
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="space-y-3">
        {exports.map((exp) => (
          <div key={exp.id} className="relative group">
            <ExportCard
              id={exp.id}
              label={exp.label}
              thumbnailUrl={exp.thumbnailUrl}
              durationSeconds={exp.duration_seconds}
              createdAt={exp.created_at}
              videoUrl={exp.videoUrl}
              isDownloading={isDownloading !== null}
              onDownload={handleDownload}
            />
            {/* Actions dropdown */}
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 bg-black/50 hover:bg-black/70 text-white">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      if (exp.videoUrl) {
                        const filename = `${(exp.label || "export").replace(/\s+/g, "_")}_${new Date(exp.created_at).getTime()}.mp4`;
                        handleDownload(exp.videoUrl, filename);
                      }
                    }}
                    disabled={isDownloading !== null}>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleDelete(exp.id)}
                    className="text-destructive focus:text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
