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
import { Plus, MoreVertical, Edit3, Trash2, Clapperboard, Check } from "lucide-react";
import type { Scene } from "~/components/timeline/types";

interface ScenesPanelProps {
    scenes: Scene[];
    activeSceneId: string | null;
    onCreateScene: (name: string) => Promise<string | null>;
    onSelectScene: (sceneId: string | null) => void;
    onDeleteScene: (sceneId: string) => Promise<boolean>;
    onRenameScene: (sceneId: string, newName: string) => Promise<boolean>;
}

export const ScenesPanel: React.FC<ScenesPanelProps> = ({
    scenes,
    activeSceneId,
    onCreateScene,
    onSelectScene,
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
                onSelectScene(sceneId); // Auto-select the new scene
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
            // If we deleted the active scene, deselect it
            if (deleteSceneId === activeSceneId) {
                onSelectScene(null);
            }
        }
    };

    return (
        <div className="h-full flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-border">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">Scenes</h3>
                    <span className="text-xs text-muted-foreground border border-border/30 rounded-full px-2 py-0.5">
                        {scenes.length}
                    </span>
                </div>
                <Button size="sm" onClick={() => setShowCreateModal(true)} className="h-7 text-xs">
                    <Plus className="h-3 w-3 mr-1" />
                    New
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {/* Main Timeline Option */}
                <Card
                    className={`p-2 cursor-pointer transition-colors ${activeSceneId === null
                        ? "bg-primary/10 border-primary"
                        : "hover:bg-muted/50"
                        }`}
                    onClick={() => onSelectScene(null)}
                >
                    <div className="flex items-center gap-2">
                        <Clapperboard className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium flex-1">Main Timeline</span>
                        {activeSceneId === null && <Check className="h-4 w-4 text-primary" />}
                    </div>
                </Card>

                {scenes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Clapperboard className="h-8 w-8 text-muted-foreground/40 mb-2" />
                        <p className="text-xs text-muted-foreground">
                            No scenes yet
                        </p>
                    </div>
                ) : (
                    scenes.map((scene) => (
                        <Card
                            key={scene.id}
                            className={`p-2 cursor-move transition-colors group ${activeSceneId === scene.id
                                ? "bg-primary/10 border-primary"
                                : "hover:bg-muted/50"
                                }`}
                            draggable
                            onDragStart={(e) => {
                                // Set drag data for timeline drop
                                e.dataTransfer.setData("application/json", JSON.stringify({
                                    type: "scene",
                                    sceneId: scene.id,
                                    sceneName: scene.name,
                                    variableSchema: scene.variableSchema,
                                }));
                                e.dataTransfer.effectAllowed = "copy";
                            }}
                            onClick={() => onSelectScene(scene.id)}
                        >
                            <div className="flex items-center gap-2">
                                <Clapperboard className="h-4 w-4 text-muted-foreground" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{scene.name}</p>
                                    {scene.variableSchema.length > 0 && (
                                        <p className="text-xs text-muted-foreground">
                                            {scene.variableSchema.length} var{scene.variableSchema.length !== 1 ? "s" : ""}
                                        </p>
                                    )}
                                </div>
                                {activeSceneId === scene.id && <Check className="h-4 w-4 text-primary" />}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button
                                            className="p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <MoreVertical className="h-3.5 w-3.5" />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setRenameSceneId(scene.id);
                                                setRenameValue(scene.name);
                                                setShowRenameModal(true);
                                            }}
                                        >
                                            <Edit3 className="h-3.5 w-3.5 mr-2" />
                                            Rename
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            className="text-destructive"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setDeleteSceneId(scene.id);
                                                setShowDeleteDialog(true);
                                            }}
                                        >
                                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                                            Delete
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </Card>
                    ))
                )}
            </div>

            {/* Create Scene Modal */}
            <Modal
                open={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                title="Create new scene"
            >
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
                        <Button
                            onClick={handleCreate}
                            disabled={creating || !newSceneName.trim()}
                        >
                            Create
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Rename Scene Modal */}
            <Modal
                open={showRenameModal}
                onClose={() => setShowRenameModal(false)}
                title="Rename scene"
            >
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
                            onClick={handleDelete}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};
