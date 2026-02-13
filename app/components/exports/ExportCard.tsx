import { Download, Film } from "lucide-react";
import { Button } from "~/components/ui/button";

interface ExportCardProps {
  id: string;
  label: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  createdAt: string;
  videoUrl: string | null;
  isDownloading: boolean;
  onDownload: (url: string, filename: string) => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ExportCard({
  id,
  label,
  thumbnailUrl,
  durationSeconds,
  createdAt,
  videoUrl,
  isDownloading,
  onDownload,
}: ExportCardProps) {
  const displayLabel = label || "Untitled Export";
  const filename = `${displayLabel.replace(/\s+/g, "_")}_${new Date(createdAt).getTime()}.mp4`;

  return (
    <div
      className="group relative bg-card border border-border rounded-lg overflow-hidden hover:border-primary/50 transition-colors"
    >
      {/* Thumbnail */}
      <div className="aspect-video bg-muted relative">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={displayLabel}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <Film className="h-8 w-8" />
          </div>
        )}
        {/* Duration badge */}
        <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
          {formatDuration(durationSeconds)}
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate" title={displayLabel}>
              {displayLabel}
            </p>
            <p className="text-xs text-muted-foreground">{formatDate(createdAt)}</p>
          </div>
          {videoUrl && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              onClick={() => onDownload(videoUrl, filename)}
              disabled={isDownloading}
              title="Download video"
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
