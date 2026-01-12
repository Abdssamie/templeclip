import React, { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Modal } from "~/components/ui/modal";
import { ScrollArea, ScrollBar } from "~/components/ui/scroll-area";
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
import { Plus, X, Edit3, Trash2, Home, Clapperboard, MonitorPlay } from "lucide-react";
import type { Scene } from "~/components/timeline/types";
import { cn } from "~/lib/utils";

interface SceneTabsProps {
    scenes: Scene[];
    activeSceneId: string | null;
    onCreateScene: (name: string) => Promise<string | null>;
    onSelectScene: (sceneId: string | null) => void;
    onDeleteScene: (sceneId: string) => Promise<boolean>;
    onRenameScene: (sceneId: string, newName: string) => Promise<boolean>;
}

export const SceneTabs: React.FC<SceneTabsProps> = ({
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
                onSelectScene(sceneId);
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

    return (
        <div className="flex items-center w-full border-b border-border bg-background select-none">
            <ScrollArea className="w-full whitespace-nowrap">
                <div className="flex items-center p-1 gap-1">
                    {/* Main Timeline Tab */}
                    <button
                        onClick={() => onSelectScene(null)}
                        className={cn(
                            "flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors border border-transparent",
                            activeSceneId === null
                                ? "bg-muted text-foreground border-border shadow-sm"
                                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        )}
                    >
                        <MonitorPlay className="h-3.5 w-3.5" />
                        Main Timeline
                    </button>

                    <div className="w-px h-4 bg-border mx-1" />



                    {/* Fixed structure implementation for loop */}
                    {scenes.map((scene) => (
                        <div
                            key={scene.id}
                            className={cn(
                                "group flex items-center gap-2 pl-3 pr-1 py-1.5 text-xs font-medium rounded-md transition-colors border border-transparent cursor-pointer relative",
                                activeSceneId === scene.id
                                    ? "bg-primary/10 text-primary border-primary/20 shadow-sm"
                                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                            )}
                            onClick={() => onSelectScene(scene.id)}
                        >
                            <Clapperboard className="h-3.5 w-3.5" />
                            <span className="mr-1">{scene.name}</span>

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button
                                        className={cn(
                                            "h-5 w-5 flex items-center justify-center rounded-sm hover:bg-background/20 opacity-0 group-hover:opacity-100 transition-all",
                                            activeSceneId === scene.id && "opacity-100"
                                        )}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="h-0.5 w-0.5 rounded-full bg-current mb-[2px]" />
                                        <div className="h-0.5 w-0.5 rounded-full bg-current mb-[2px]" />
                                        <div className="h-0.5 w-0.5 rounded-full bg-current" />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                    <DropdownMenuItem onClick={() => {
                                        setRenameSceneId(scene.id);
                                        setRenameValue(scene.name);
                                        setShowRenameModal(true);
                                    }}>
                                        <Edit3 className="h-3.5 w-3.5 mr-2" />
                                        Rename
                                    </DropdownMenuItem>

                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    ))}

                    {/* New Scene Button */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 ml-1 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowCreateModal(true)}
                        title="Create New Scene"
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
                <ScrollBar orientation="horizontal" className="h-2" />
            </ScrollArea>

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
