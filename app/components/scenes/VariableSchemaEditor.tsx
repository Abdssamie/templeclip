import React, { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import { Card } from "~/components/ui/card";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import type { SceneVariableSchema } from "~/components/timeline/types";

interface VariableSchemaEditorProps {
    variables: SceneVariableSchema[];
    onChange: (variables: SceneVariableSchema[]) => void;
}

export const VariableSchemaEditor: React.FC<VariableSchemaEditorProps> = ({
    variables,
    onChange,
}) => {
    const [newVarName, setNewVarName] = useState("");
    const [newVarType, setNewVarType] = useState<"text" | "image" | "video" | "audio">("text");
    const [newVarRequired, setNewVarRequired] = useState(true);

    const handleAdd = () => {
        if (!newVarName.trim()) return;

        // Check for duplicate names
        if (variables.some((v) => v.name === newVarName.trim())) {
            alert("Variable name already exists");
            return;
        }

        const newVariable: SceneVariableSchema = {
            name: newVarName.trim(),
            type: newVarType,
            required: newVarRequired,
        };

        onChange([...variables, newVariable]);
        setNewVarName("");
        setNewVarType("text");
        setNewVarRequired(true);
    };

    const handleRemove = (name: string) => {
        onChange(variables.filter((v) => v.name !== name));
    };

    const handleToggleRequired = (name: string) => {
        onChange(
            variables.map((v) =>
                v.name === name ? { ...v, required: !v.required } : v
            )
        );
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Variable Schema</h3>
                <span className="text-xs text-muted-foreground">
                    {variables.length} variable{variables.length !== 1 ? "s" : ""}
                </span>
            </div>

            {variables.length > 0 && (
                <div className="space-y-2">
                    {variables.map((variable) => (
                        <Card key={variable.name} className="p-3">
                            <div className="flex items-center gap-3">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                                            {`{{${variable.name}}}`}
                                        </code>
                                        <span className="text-xs text-muted-foreground capitalize">
                                            {variable.type}
                                        </span>
                                        {variable.required && (
                                            <span className="text-xs text-destructive">*</span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button
                                        size="sm"
                                        variant={variable.required ? "default" : "outline"}
                                        onClick={() => handleToggleRequired(variable.name)}
                                        className="h-7 text-xs"
                                    >
                                        {variable.required ? "Required" : "Optional"}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleRemove(variable.name)}
                                        className="h-7 w-7 p-0"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            <Card className="p-3 bg-muted/30">
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span>
                            Use variables in scrubber URLs like{" "}
                            <code className="bg-background px-1 rounded">{`{{variable_name}}`}</code>
                        </span>
                    </div>
                    <div className="grid grid-cols-[1fr,auto,auto,auto] gap-2">
                        <Input
                            placeholder="Variable name (e.g., headline)"
                            value={newVarName}
                            onChange={(e) => setNewVarName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleAdd();
                            }}
                            className="h-8 text-sm"
                        />
                        <Select
                            value={newVarType}
                            onValueChange={(value: "text" | "image" | "video" | "audio") =>
                                setNewVarType(value)
                            }
                        >
                            <SelectTrigger className="h-8 w-24 text-sm">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="text">Text</SelectItem>
                                <SelectItem value="image">Image</SelectItem>
                                <SelectItem value="video">Video</SelectItem>
                                <SelectItem value="audio">Audio</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button
                            size="sm"
                            variant={newVarRequired ? "default" : "outline"}
                            onClick={() => setNewVarRequired(!newVarRequired)}
                            className="h-8 text-xs"
                        >
                            {newVarRequired ? "Required" : "Optional"}
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleAdd}
                            disabled={!newVarName.trim()}
                            className="h-8"
                        >
                            <Plus className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
};
