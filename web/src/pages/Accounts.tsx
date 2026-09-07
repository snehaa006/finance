import * as React from "react";
import { Banknote, Landmark, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useAppData } from "@/lib/store";
import { formatMoney, toMajorString, toMinor } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Account, AccountType } from "@/lib/types";

export function Accounts() {
  const { accounts, refresh, loading } = useAppData();
  const [editing, setEditing] = React.useState<Account | null>(null);
  const [creating, setCreating] = React.useState(false);

  const netWorth = accounts.filter((a) => !a.archived).reduce((s, a) => s + a.balance, 0);
  const groups: { type: AccountType; label: string }[] = [
    { type: "bank", label: "Bank accounts" },
    { type: "cash", label: "Cash" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
          <p className="text-sm text-muted-foreground">
            Net worth {formatMoney(netWorth)}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus /> New
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No accounts yet. Create one to start logging transactions.
          </CardContent>
        </Card>
      ) : (
        groups.map(({ type, label }) => {
          const list = accounts.filter((a) => a.type === type);
          if (list.length === 0) return null;
          return (
            <Card key={type}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  {type === "cash" ? (
                    <Banknote className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Landmark className="h-4 w-4 text-muted-foreground" />
                  )}
                  {label}
                </CardTitle>
                <CardDescription className="tabular">
                  {formatMoney(list.filter((a) => !a.archived).reduce((s, a) => s + a.balance, 0))}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y border-t">
                  {list.map((a) => (
                    <li key={a.id}>
                      <button
                        onClick={() => setEditing(a)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50 sm:px-5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">{a.name}</span>
                            {!!a.archived && <Badge variant="secondary">archived</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {a.transaction_count} transaction{a.transaction_count === 1 ? "" : "s"}
                            {" · opened with "}
                            {formatMoney(a.starting_balance)}
                          </div>
                        </div>
                        <span
                          className={cn(
                            "tabular font-semibold",
                            a.balance < 0 && "text-destructive",
                          )}
                        >
                          {formatMoney(a.balance)}
                        </span>
                        <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })
      )}

      <AccountDialog
        open={creating || !!editing}
        account={editing}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false);
            setEditing(null);
          }
        }}
        onSaved={refresh}
      />
    </div>
  );
}

function AccountDialog({
  open,
  account,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  account: Account | null;
  onOpenChange: (o: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<AccountType>("bank");
  const [starting, setStarting] = React.useState("0");
  const [archived, setArchived] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(account?.name ?? "");
    setType(account?.type ?? "bank");
    setStarting(account ? toMajorString(account.starting_balance) : "0");
    setArchived(!!account?.archived);
  }, [open, account]);

  async function save() {
    if (!name.trim()) {
      toast("Give the account a name", "error");
      return;
    }
    const minor = toMinor(starting || "0");
    if (!Number.isFinite(minor)) {
      toast("Starting balance must be a number", "error");
      return;
    }
    setBusy(true);
    try {
      const body = { name: name.trim(), type, starting_balance: minor, archived };
      if (account) await api.put(`/accounts/${account.id}`, body);
      else await api.post("/accounts", body);
      toast(account ? "Account updated" : "Account created");
      await onSaved();
      onOpenChange(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!account) return;
    if (
      !confirm(
        `Delete "${account.name}"? Its ${account.transaction_count} transaction(s) will be deleted too.`,
      )
    )
      return;
    setBusy(true);
    try {
      await api.del(`/accounts/${account.id}`);
      toast("Account deleted");
      await onSaved();
      onOpenChange(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{account ? "Edit account" : "New account"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="acc-name">Name</Label>
            <Input
              id="acc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="HDFC Savings"
              className="mt-1"
            />
          </div>
          <div>
            <Label>Type</Label>
            <div className="mt-1 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {(["bank", "cash"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    "rounded-md py-2 text-sm font-medium capitalize transition-colors",
                    type === t ? "bg-background shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="acc-start">Starting balance</Label>
            <Input
              id="acc-start"
              inputMode="decimal"
              value={starting}
              onChange={(e) => setStarting(e.target.value)}
              className="mt-1 tabular"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              The balance before any transaction below was logged.
            </p>
          </div>
          {account && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) => setArchived(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              Archive (hide from quick add and dashboard)
            </label>
          )}
          <div className="flex gap-2">
            {account && (
              <Button variant="outline" onClick={remove} disabled={busy}>
                Delete
              </Button>
            )}
            <Button className="flex-1" size="lg" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
