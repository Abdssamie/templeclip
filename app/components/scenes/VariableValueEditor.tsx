import React, { useState, useEffect } from "react";
import { Modal } from "~/components/ui/modal";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { SceneVariableSchema } from "~/components/timeline/types";

interface VariableValueEditorProps {
    open: boolean;
    onClose: () => void;
    sceneName?: string;
    variableSchema: SceneVariableSchema[];
    currentValues: Record<string, string>;
    onSave: (values: Record<string, string>) => void;
}

export const VariableValueEditor: React.FC<VariableValueEditorProps> = ({
    open,
    onClose,
    sceneName,
    variableSchema,
    currentValues,
    onSave,
}) => {
    const [values, setValues] = useState<Record<string, string>>({});

    useEffect(() => {
        if (open) {
            setValues({ ...currentValues });
        }
    }, [open, currentValues]);

    const handleSave = () => {
        onSave(values);
        onClose();
    };

    const handleChange = (name: string, value: string) => {
        setValues((prev) => ({ ...prev, [name]: value }));
    };

    return (
        <Modal open={open} onClose={onClose} title={`Edit Variables: ${sceneName || "Scene"}`}>
            <div className="space-y-4 pt-2">
                {variableSchema.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                        No variables defined for this scene.
                    </p>
                ) : (
                    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                        {variableSchema.map((variable) => (
                            <div key={variable.name} className="space-y-1.5">
                                <Label htmlFor={`var-${variable.name}`} className="text-xs font-medium flex items-center gap-1.5">
                                    {variable.name}
                                    <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground uppercase">
                                        {variable.type}
                                    </span>
                                </Label>
                                <Input
                                    id={`var-${variable.name}`}
                                    value={values[variable.name] || ""}
                                    onChange={(e) => handleChange(variable.name, e.target.value)}
                                    placeholder={`Enter value for ${variable.name}...`}
                                    className="h-8 text-sm"
                                />
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
                    <Button variant="ghost" size="sm" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button size="sm" onClick={handleSave}>
                        Save Changes
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
