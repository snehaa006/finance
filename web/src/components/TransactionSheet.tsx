import * as React from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  Landmark,
  Trash2,
} from "lucide-react";
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
import { formatMoney, toMajorString, toMinor, today } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Account, Transaction, TxType } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Passing a transaction switches the sheet from quick-add to edit mode. */
  transaction?: Transaction | null;
  onSaved?: () => void;
}

/**
 * One sheet serves both "add" and "edit".
 *
 * The whole question this form asks is: did money come IN or go OUT, and which
 * pocket did it touch — the bank or cash. So those are the only two things on
 * screen above the amount, in those words. "Expense"/"income"/"transfer" never
 * appear; moving money between your own accounts is tucked away behind a link
 * and is not offered at all until there are two accounts to move between.
 */
export function TransactionSheet({
  open,
  onOpenChange,
  transaction,
  onSaved,
}: Props) {
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

  const active = React.useMemo(
    () => accounts.filter((a) => !a.archived),
    [accounts],
  );
  // With a single account there is nothing to move money between, so the whole
  // idea of a transfer stays hidden.
  const canTransfer = active.length > 1;

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
        active.some((a) => a.id === remembered)
          ? remembered
          : (active[0]?.id ?? null),
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
      toast(
        isTransfer ? "Pick where the money came from" : "Pick bank or cash",
        "error",
      );
      return;
    }
    if (isTransfer && !toAccountId) {
      toast("Pick where the money went", "error");
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
      toast(
        editing
          ? "Saved"
          : type === "income"
            ? "Money in saved"
            : "Money out saved",
      );
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
    if (!confirm("Delete this entry?")) return;
    setSaving(true);
    try {
      await api.del(`/transactions/${transaction.id}`);
      toast("Deleted");
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
  const isIn = type === "income";
  const lockedTransfer = editing && !!transaction?.transfer_group_id;
  const minor = toMinor(amount);
  const validAmount = Number.isFinite(minor) && minor !== 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? "Edit this entry"
              : isTransfer
                ? "Move money"
                : "Add money in or out"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Choose whether money came in or went out, enter the amount, and pick
            bank or cash.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {!isTransfer && (
            <div className="grid grid-cols-2 gap-2">
              <DirectionCard
                selected={!isIn}
                onClick={() => setType("expense")}
                tone="out"
                icon={ArrowUpRight}
                title="Money out"
                subtitle="I spent or paid"
              />
              <DirectionCard
                selected={isIn}
                onClick={() => setType("income")}
                tone="in"
                icon={ArrowDownLeft}
                title="Money in"
                subtitle="I received it"
              />
            </div>
          )}

          {isTransfer && (
            <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm">
              <ArrowLeftRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span>
                Moving your own money between accounts — nothing is spent or
                earned.
              </span>
            </div>
          )}

          <div>
            <Label htmlFor="amount">How much?</Label>
            <div className="relative mt-1.5">
              <span
                className={cn(
                  "pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-medium",
                  isTransfer
                    ? "text-muted-foreground"
                    : isIn
                      ? "text-money-in"
                      : "text-money-out",
                )}
              >
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
                className={cn(
                  "tabular h-16 rounded-xl pl-10 text-3xl font-semibold",
                  !isTransfer && (isIn ? "text-money-in" : "text-money-out"),
                )}
              />
            </div>
          </div>

          <div>
            <Label>
              {isTransfer
                ? "Take it from"
                : isIn
                  ? "Where did it go?"
                  : "Where did it come from?"}
            </Label>
            <AccountRow
              accounts={active}
              selected={accountId}
              onSelect={setAccountId}
              tone={isTransfer ? "neutral" : isIn ? "in" : "out"}
            />
          </div>

          {isTransfer && (
            <div>
              <Label>Put it into</Label>
              <AccountRow
                accounts={active.filter((a) => a.id !== accountId)}
                selected={toAccountId}
                onSelect={setToAccountId}
                tone="neutral"
              />
            </div>
          )}

          {/* A category makes no sense on money you simply moved to another pocket. */}
          {!isTransfer && (
            <div>
              <Label>
                What was it for?{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {categories.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No categories yet.
                  </p>
                ) : (
                  categories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setCategoryId(c.id === categoryId ? null : c.id)
                      }
                      className={cn(
                        "rounded-full border px-3 py-2 text-sm transition-colors",
                        categoryId === c.id
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-card hover:bg-accent",
                      )}
                    >
                      {c.name}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {showMore ? (
            <div className="space-y-3">
              <div>
                <Label htmlFor="date">When?</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="note">Note</Label>
                <Textarea
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. groceries at the market"
                  className="mt-1.5"
                />
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowMore(true)}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Change the date or add a note
            </button>
          )}

          {/* A plain-English read-back, so there is no doubt about what saving does. */}
          <Summary
            type={type}
            amount={validAmount ? Math.abs(minor) : null}
            from={active.find((a) => a.id === accountId) ?? null}
            to={active.find((a) => a.id === toAccountId) ?? null}
          />

          <div className="flex gap-2">
            {editing && (
              <Button
                variant="outline"
                size="lg"
                onClick={remove}
                disabled={saving}
              >
                <Trash2 />
                <span className="sr-only">Delete</span>
              </Button>
            )}
            <Button
              size="lg"
              className={cn(
                "flex-1",
                !isTransfer &&
                  (isIn
                    ? "bg-money-in text-money-in-ink hover:bg-money-in/90"
                    : "bg-money-out text-money-out-ink hover:bg-money-out/90"),
              )}
              onClick={save}
              disabled={saving}
            >
              {saving ? "Saving…" : editing ? "Save changes" : "Save"}
            </Button>
          </div>

          {/* Transfers are an edge case for one-account users, so they live here
              rather than as a third choice competing with in/out. */}
          {!editing && canTransfer && (
            <button
              type="button"
              onClick={() => {
                setType(isTransfer ? "expense" : "transfer");
                setToAccountId(null);
              }}
              className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              {isTransfer
                ? "Back to money in / money out"
                : "Just moving money between my own accounts?"}
            </button>
          )}
          {lockedTransfer && (
            <p className="text-center text-xs text-muted-foreground">
              This is one half of a move between your accounts. Editing it
              updates both halves.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DirectionCard({
  selected,
  onClick,
  tone,
  icon: Icon,
  title,
  subtitle,
}: {
  selected: boolean;
  onClick: () => void;
  tone: "in" | "out";
  icon: typeof ArrowUpRight;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex flex-col items-start gap-1 rounded-xl border-2 p-3 text-left transition-colors",
        selected
          ? tone === "in"
            ? "border-money-in bg-money-in-soft"
            : "border-money-out bg-money-out-soft"
          : "border-border bg-card hover:bg-accent/60",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full",
          selected
            ? tone === "in"
              ? "bg-money-in text-money-in-ink"
              : "bg-money-out text-money-out-ink"
            : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span
        className={cn(
          "font-semibold",
          selected && (tone === "in" ? "text-money-in" : "text-money-out"),
        )}
      >
        {title}
      </span>
      <span className="text-xs text-muted-foreground">{subtitle}</span>
    </button>
  );
}

function AccountRow({
  accounts,
  selected,
  onSelect,
  tone,
}: {
  accounts: Account[];
  selected: number | null;
  onSelect: (id: number) => void;
  tone: "in" | "out" | "neutral";
}) {
  if (accounts.length === 0) {
    return (
      <p className="mt-1.5 text-sm text-muted-foreground">
        No account yet — add one under Accounts first.
      </p>
    );
  }
  return (
    <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
      {accounts.map((a) => {
        const isSelected = selected === a.id;
        const Icon = a.type === "cash" ? Banknote : Landmark;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelect(a.id)}
            aria-pressed={isSelected}
            className={cn(
              "flex items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-left transition-colors",
              isSelected
                ? tone === "in"
                  ? "border-money-in bg-money-in-soft"
                  : tone === "out"
                    ? "border-money-out bg-money-out-soft"
                    : "border-primary bg-accent"
                : "border-border bg-card hover:bg-accent/60",
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 shrink-0",
                isSelected
                  ? tone === "in"
                    ? "text-money-in"
                    : tone === "out"
                      ? "text-money-out"
                      : "text-primary"
                  : "text-muted-foreground",
              )}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {a.name}
              </span>
              <span className="tabular block text-xs text-muted-foreground">
                {describe(a)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** "ICICI Bank · Bank · ₹100" reads badly, so the kind is dropped when the name
    already says it. */
function describe(a: Account): string {
  const kind = a.type === "cash" ? "Cash" : "Bank";
  const named = a.name.toLowerCase().includes(kind.toLowerCase());
  const balance = formatMoney(a.balance);
  return named ? balance : `${kind} · ${balance}`;
}

function Summary({
  type,
  amount,
  from,
  to,
}: {
  type: TxType;
  amount: number | null;
  from: Account | null;
  to: Account | null;
}) {
  if (amount === null || !from) return null;
  const money = formatMoney(amount);
  const where = (a: Account) =>
    a.type === "cash" ? `cash (${a.name})` : a.name;

  let text: React.ReactNode;
  if (type === "transfer") {
    text = to ? (
      <>
        Moving <strong>{money}</strong> from {where(from)} to {where(to)}.
      </>
    ) : (
      <>
        Moving <strong>{money}</strong> out of {where(from)} — pick where it
        goes.
      </>
    );
  } else if (type === "income") {
    text = (
      <>
        <strong>{money}</strong> came in and went into {where(from)}.
      </>
    );
  } else {
    text = (
      <>
        <strong>{money}</strong> went out of {where(from)}.
      </>
    );
  }

  return (
    <p
      className={cn(
        "rounded-xl px-3 py-2 text-sm",
        type === "income"
          ? "bg-money-in-soft text-money-in"
          : type === "expense"
            ? "bg-money-out-soft text-money-out"
            : "bg-muted text-muted-foreground",
      )}
    >
      {text}
    </p>
  );
}
