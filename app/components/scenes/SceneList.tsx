import React, { useState } from "react";
import { Card } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Modal } from "~/components/ui/modal";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "~/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "~/components/ui/alert-dialog";
import { Plus, MoreVertical, Edit3, Trash2, Clapperboard } from "lucide-react";
import type { Scene } from "~/components/timeline/types";

interface SceneListProps {
  scenes: Scene[];
  onCreateScene: (name: string) => Promise<string | null>;
  onEditScene: (sceneId: string) => void;
  onDeleteScene: (sceneId: string) => Promise<boolean>;
  onRenameScene: (sceneId: string, newName: string) => Promise<boolean>;
}

export const SceneList: React.FC<SceneListProps> = ({
  scenes,
  onCreateScene,
  onEditScene,
  onDeleteScene,
  onRenameScene,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSceneName, setNewSceneName] = useState("");
  const [creating, setCreating] = useState(false);

  const [renameSceneId, setRenameSceneId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [showRenameModal, setShowRenameModal] = useState(false);

  const [deleteSceneId, setDeleteSceneId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleCreate = async () => {
    if (!newSceneName.trim()) return;
    setCreating(true);
    try {
      const sceneId = await onCreateScene(newSceneName.trim());
      if (sceneId) {
        setShowCreateModal(false);
        setNewSceneName("");
      }
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async () => {
    if (!renameSceneId || !renameValue.trim()) return;
    const success = await onRenameScene(renameSceneId, renameValue.trim());
    if (success) {
      setShowRenameModal(false);
      setRenameSceneId(null);
      setRenameValue("");
    }
  };

  const handleDelete = async () => {
    if (!deleteSceneId) return;
    const success = await onDeleteScene(deleteSceneId);
    if (success) {
      setShowDeleteDialog(false);
      setDeleteSceneId(null);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Unknown";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">Scenes</h2>
          <span className="text-xs text-muted-foreground border border-border/30 rounded-full px-2 py-0.5">
            {scenes.length}
          </span>
        </div>
        <Button size="sm" onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-1" />
          New Scene
        </Button>
      </div>

      {scenes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-2xl bg-muted/30 flex items-center justify-center mb-6 border border-border/20">
            <Clapperboard className="h-9 w-9 text-muted-foreground/40" />
          </div>
          <h3 className="text-xl font-medium text-muted-foreground/80 mb-3">No scenes yet</h3>
          <p className="text-sm text-muted-foreground/60 max-w-md">
            Create reusable scenes that can be composed together to generate automated videos.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {scenes.map((scene) => (
            <Card
              key={scene.id}
              className="group h-36 border-border/20 bg-card/50 hover:bg-card hover:border-border/30 backdrop-blur-sm transition-all duration-300 cursor-pointer relative overflow-hidden"
              onClick={() => onEditScene(scene.id)}>
              <div className="p-5 h-full flex flex-col relative">
                <div className="flex-1 relative z-10">
                  <h3
                    className="text-lg font-semibold text-foreground leading-tight"
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}>
                    {scene.name}
                  </h3>
                  {scene.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{scene.description}</p>
                  )}
                </div>

                <div className="space-y-0.5 relative z-10 mt-auto mb-1">
                  <p className="text-xs text-muted-foreground font-medium">
                    {formatDate(scene.updatedAt || scene.createdAt)}
                  </p>
                  <p className="text-[10px] text-muted-foreground/70">
                    {scene.variableSchema.length} variable
                    {scene.variableSchema.length !== 1 ? "s" : ""}
                  </p>
                </div>

                <div className="absolute bottom-0.5 right-0.5 transition-opacity duration-300 z-20 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="p-1.5 text-muted-foreground hover:text-foreground transition-colors duration-200"
                        onClick={(e) => e.stopPropagation()}>
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenameSceneId(scene.id);
                          setRenameValue(scene.name);
                          setShowRenameModal(true);
                        }}>
                        <Edit3 className="h-3.5 w-3.5 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteSceneId(scene.id);
                          setShowDeleteDialog(true);
                        }}>
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Scene Modal */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create new scene">
        <div className="space-y-3">
          <Input
            placeholder="Scene name"
            value={newSceneName}
            onChange={(e) => setNewSceneName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newSceneName.trim()) {
                handleCreate();
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !newSceneName.trim()}>
              Create
            </Button>
          </div>
        </div>
      </Modal>

      {/* Rename Scene Modal */}
      <Modal open={showRenameModal} onClose={() => setShowRenameModal(false)} title="Rename scene">
        <div className="space-y-3">
          <Input
            placeholder="Scene name"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && renameValue.trim()) {
                handleRename();
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowRenameModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!renameValue.trim()}>
              Save
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete scene?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the scene.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
