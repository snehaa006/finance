import * as React from "react";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useAppData } from "@/lib/store";
import { toMajorString, toMinor, today } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Transaction, TxType } from "@/lib/types";

const TYPES: { value: TxType; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Passing a transaction switches the sheet from quick-add to edit mode. */
  transaction?: Transaction | null;
  onSaved?: () => void;
}

/**
 * One sheet serves both "quick add" and "edit". The quick-add path is tuned for
 * speed: the amount field is focused on open, and category/account are single
 * taps on chips rather than dropdowns, so a typical entry is amount → tap →
 * tap → save.
 */
export function TransactionSheet({ open, onOpenChange, transaction, onSaved }: Props) {
  const { accounts, categories, refresh } = useAppData();
  const toast = useToast();
  const editing = !!transaction;

  const [type, setType] = React.useState<TxType>("expense");
  const [amount, setAmount] = React.useState("");
  const [accountId, setAccountId] = React.useState<number | null>(null);
  const [toAccountId, setToAccountId] = React.useState<number | null>(null);
  const [categoryId, setCategoryId] = React.useState<number | null>(null);
  const [date, setDate] = React.useState(today());
  const [note, setNote] = React.useState("");
  const [showMore, setShowMore] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const active = React.useMemo(() => accounts.filter((a) => !a.archived), [accounts]);

  // Reset (or hydrate) the form each time the sheet opens.
  React.useEffect(() => {
    if (!open) return;
    if (transaction) {
      setType(transaction.type);
      setAmount(toMajorString(transaction.amount));
      setAccountId(transaction.account_id);
      setCategoryId(transaction.category_id);
      setDate(transaction.date);
      setNote(transaction.note ?? "");
      setShowMore(true);
    } else {
      setType("expense");
      setAmount("");
      setCategoryId(null);
      setDate(today());
      setNote("");
      setShowMore(false);
      // Default to the last account used, so repeat entries need no tap at all.
      const remembered = Number(localStorage.getItem("lastAccountId"));
      setAccountId(
        active.some((a) => a.id === remembered) ? remembered : (active[0]?.id ?? null),
      );
      setToAccountId(null);
    }
  }, [open, transaction, active]);

  async function save() {
    const minor = toMinor(amount);
    if (!Number.isFinite(minor) || minor === 0) {
      toast("Enter an amount", "error");
      return;
    }
    if (!accountId) {
      toast("Pick an account", "error");
      return;
    }
    if (type === "transfer" && !toAccountId) {
      toast("Pick the account to transfer to", "error");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        account_id: accountId,
        to_account_id: toAccountId,
        category_id: categoryId,
        amount: Math.abs(minor),
        type,
        date,
        note: note || null,
      };
      if (editing) await api.put(`/transactions/${transaction!.id}`, payload);
      else await api.post("/transactions", payload);

      localStorage.setItem("lastAccountId", String(accountId));
      toast(editing ? "Transaction updated" : "Transaction saved");
      await refresh();
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save", "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!transaction) return;
    if (!confirm("Delete this transaction?")) return;
    setSaving(true);
    try {
      await api.del(`/transactions/${transaction.id}`);
      toast("Transaction deleted");
      await refresh();
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete", "error");
    } finally {
      setSaving(false);
    }
  }

  const isTransfer = type === "transfer";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit transaction" : "Quick add"}</DialogTitle>
          <DialogDescription className="sr-only">
            Enter an amount, pick a category and account, then save.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Type toggle — hidden when editing a transfer, whose legs are fixed. */}
          {!(editing && transaction?.transfer_group_id) && (
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  disabled={editing && t.value === "transfer"}
                  onClick={() => setType(t.value)}
                  className={cn(
                    "rounded-md py-2 text-sm font-medium transition-colors disabled:opacity-40",
                    type === t.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          <div>
            <Label htmlFor="amount">Amount</Label>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-2xl text-muted-foreground">
                ₹
              </span>
              <Input
                id="amount"
                autoFocus={!editing}
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save()}
                className="h-16 pl-9 text-3xl font-semibold tabular"
              />
            </div>
          </div>

          <div>
            <Label>{isTransfer ? "From account" : "Account"}</Label>
            <ChipRow
              items={active.map((a) => ({ id: a.id, label: a.name, hint: a.type }))}
              selected={accountId}
              onSelect={setAccountId}
            />
          </div>

          {isTransfer && (
            <div>
              <Label>To account</Label>
              <ChipRow
                items={active
                  .filter((a) => a.id !== accountId)
                  .map((a) => ({ id: a.id, label: a.name, hint: a.type }))}
                selected={toAccountId}
                onSelect={setToAccountId}
              />
            </div>
          )}

          <div>
            <Label>Category</Label>
            <ChipRow
              items={categories.map((c) => ({ id: c.id, label: c.name }))}
              selected={categoryId}
              onSelect={(id) => setCategoryId(id === categoryId ? null : id)}
              wrap
            />
          </div>

          {showMore ? (
            <div className="space-y-3">
              <div>
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="note">Note</Label>
                <Textarea
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional"
                  className="mt-1"
                />
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowMore(true)}
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              Add date or note
            </button>
          )}

          <div className="flex gap-2 pt-1">
            {editing && (
              <Button variant="outline" size="lg" onClick={remove} disabled={saving}>
                <Trash2 />
                <span className="sr-only">Delete</span>
              </Button>
            )}
            <Button size="lg" className="flex-1" onClick={save} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChipRow({
  items,
  selected,
  onSelect,
  wrap,
}: {
  items: { id: number; label: string; hint?: string }[];
  selected: number | null;
  onSelect: (id: number) => void;
  wrap?: boolean;
}) {
  if (items.length === 0) {
    return <p className="mt-1 text-sm text-muted-foreground">None yet — add one first.</p>;
  }
  return (
    <div
      className={cn(
        "mt-1 gap-1.5",
        wrap ? "flex flex-wrap" : "flex overflow-x-auto pb-1 [scrollbar-width:none]",
      )}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
          className={cn(
            "shrink-0 rounded-full border px-3 py-2 text-sm transition-colors",
            selected === item.id
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input bg-background hover:bg-accent",
          )}
        >
          {item.label}
          {item.hint && (
            <span className="ml-1 text-xs opacity-60">{item.hint === "cash" ? "cash" : "bank"}</span>
          )}
        </button>
      ))}
    </div>
  );
}
