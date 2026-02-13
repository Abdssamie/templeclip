import React from "react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

export function ApiKeysSection() {
  const [keys, setKeys] = React.useState<any[]>([]);
  const [newKey, setNewKey] = React.useState<string | null>(null);
  const [isCreating, setIsCreating] = React.useState(false);
  const [name, setName] = React.useState("");

  const fetchKeys = async () => {
    try {
      const res = await fetch("/api/keys");
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys);
      }
    } catch (err) {
      console.error(err);
    }
  };

  React.useEffect(() => {
    fetchKeys();
  }, []);

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewKey(data.key);
        setKeys((prev) => [data.record, ...prev]);
        setName("");
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    if (!confirm("Are you sure you want to revoke this key? This action cannot be undone.")) return;
    try {
      await fetch("/api/keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyId }),
      });
      setKeys((prev) => prev.filter((k) => k.id !== keyId));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">API Keys</h2>
          <p className="text-sm text-muted-foreground">Manage your API keys for external access.</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex gap-2 items-end">
          <div className="grid gap-1.5 flex-1">
            <label htmlFor="key-name" className="text-sm font-medium">
              New Key Name
            </label>
            <input
              id="key-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. CI/CD Pipeline"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <Button onClick={handleCreate} disabled={!name.trim() || isCreating}>
            {isCreating ? "Creating..." : "Generate Key"}
          </Button>
        </div>

        {newKey && (
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
            <div className="text-sm font-medium text-yellow-600 mb-1">
              New Key Generated (Copy this now, you won't see it again!)
            </div>
            <div className="flex items-center gap-2">
              <code className="bg-background border p-2 rounded flex-1 font-mono text-sm">{newKey}</code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(newKey);
                  alert("Copied!");
                  setNewKey(null);
                }}>
                Copy & Close
              </Button>
            </div>
          </div>
        )}

        <div className="border rounded-md divide-y">
          {keys.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">No API keys generated yet.</div>
          ) : (
            keys.map((key) => (
              <div key={key.id} className="p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">{key.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    Prefix: {key.prefix} • Created: {new Date(key.created_at).toLocaleDateString()}
                    {key.last_used_at && ` • Last used: ${new Date(key.last_used_at).toLocaleDateString()}`}
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => handleRevoke(key.id)}>
                  Revoke
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  );
}