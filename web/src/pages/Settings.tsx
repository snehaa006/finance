import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useAppData } from "@/lib/store";
import { useAuth } from "@/lib/auth";

export function Settings() {
  const { categories, refresh } = useAppData();
  const { logout } = useAuth();
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.post("/categories", { name: name.trim() });
      setName("");
      toast("Category added");
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add category", "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeCategory(id: number, label: string) {
    if (!confirm(`Delete "${label}"? Its transactions become uncategorised.`)) return;
    try {
      await api.del(`/categories/${id}`);
      toast("Category deleted");
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete", "error");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Categories and session.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Categories</CardTitle>
          <CardDescription>
            The built-in list can't be deleted; anything you add here can.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={addCategory} className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New category name"
            />
            <Button type="submit" disabled={busy || !name.trim()}>
              <Plus />
              <span className="sr-only sm:not-sr-only">Add</span>
            </Button>
          </form>

          <ul className="divide-y rounded-lg border">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <span className="flex-1 truncate">{c.name}</span>
                <span className="text-xs text-muted-foreground">
                  {c.transaction_count} used
                </span>
                {c.is_custom ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    onClick={() => removeCategory(c.id, c.name)}
                    aria-label={`Delete ${c.name}`}
                  >
                    <Trash2 />
                  </Button>
                ) : (
                  <Badge variant="secondary" className="font-normal">
                    built-in
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Session</CardTitle>
          <CardDescription>Signed in with the app password.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={logout}>
            Log out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
