import * as React from "react";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Filter, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TransactionSheet } from "@/components/TransactionSheet";
import { api, qs } from "@/lib/api";
import { useAppData } from "@/lib/store";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Transaction, TransactionPage } from "@/lib/types";

const ALL = "all";
const PAGE_SIZE = 50;

export function Transactions() {
  const { accounts, categories, revision } = useAppData();
  // "Moved between accounts" is meaningless with a single account, so it is not
  // offered as a filter until there are two.
  const canTransfer = accounts.filter((a) => !a.archived).length > 1;
  const [filters, setFilters] = React.useState({
    start: "",
    end: "",
    account_id: ALL,
    category_id: ALL,
    type: ALL,
    search: "",
  });
  const [showFilters, setShowFilters] = React.useState(false);
  const [page, setPage] = React.useState<TransactionPage | null>(null);
  const [offset, setOffset] = React.useState(0);
  const [editing, setEditing] = React.useState<Transaction | null>(null);
  const [localRevision, setLocalRevision] = React.useState(0);

  const activeFilterCount = Object.entries(filters).filter(
    ([, v]) => v !== "" && v !== ALL,
  ).length;

  React.useEffect(() => {
    setPage(null);
    api
      .get<TransactionPage>(
        `/transactions${qs({
          ...filters,
          account_id: filters.account_id === ALL ? "" : filters.account_id,
          category_id: filters.category_id === ALL ? "" : filters.category_id,
          type: filters.type === ALL ? "" : filters.type,
          limit: PAGE_SIZE,
          offset,
        })}`,
      )
      .then(setPage)
      .catch(() => setPage(null));
  }, [filters, offset, revision, localRevision]);

  const set = (key: keyof typeof filters, value: string) => {
    setOffset(0);
    setFilters((f) => ({ ...f, [key]: value }));
  };

  const clear = () => {
    setOffset(0);
    setFilters({ start: "", end: "", account_id: ALL, category_id: ALL, type: ALL, search: "" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">History</h1>
          <p className="text-sm text-muted-foreground">
            {page ? `${page.total} entries` : "Loading…"}
          </p>
        </div>
        <Button
          variant={activeFilterCount ? "default" : "outline"}
          onClick={() => setShowFilters((s) => !s)}
        >
          <Filter />
          Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
        </Button>
      </div>

      {showFilters && (
        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                value={filters.search}
                onChange={(e) => set("search", e.target.value)}
                placeholder="Note, category or account"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="start">From</Label>
              <Input
                id="start"
                type="date"
                value={filters.start}
                onChange={(e) => set("start", e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="end">To</Label>
              <Input
                id="end"
                type="date"
                value={filters.end}
                onChange={(e) => set("end", e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Account</Label>
              <Select value={filters.account_id} onValueChange={(v) => set("account_id", v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All accounts</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={filters.category_id} onValueChange={(v) => set("category_id", v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>In or out</Label>
              <Select value={filters.type} onValueChange={(v) => set("type", v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Everything</SelectItem>
                  <SelectItem value="expense">Money out</SelectItem>
                  <SelectItem value="income">Money in</SelectItem>
                  {canTransfer && (
                    <SelectItem value="transfer">Moved between accounts</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            {activeFilterCount > 0 && (
              <Button variant="ghost" onClick={clear} className="justify-start sm:col-span-2 lg:col-span-3">
                <X /> Clear filters
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {page && page.total > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="flex items-center gap-2.5 p-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-money-in-soft text-money-in">
                <ArrowDownLeft className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">Money in</div>
                <div className="tabular font-semibold text-money-in">
                  {formatMoney(page.inflow)}
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-2.5 p-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-money-out-soft text-money-out">
                <ArrowUpRight className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">Money out</div>
                <div className="tabular font-semibold text-money-out">
                  {formatMoney(page.outflow)}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!page ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : page.transactions.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nothing matches these filters.
          </CardContent>
        </Card>
      ) : (
        <Card className="divide-y overflow-hidden">
          {page.transactions.map((t) => (
            <button
              key={t.id}
              onClick={() => setEditing(t)}
              className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-accent/50 sm:p-4"
            >
              {/* A coloured arrow says in-or-out before any number is read. */}
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                  t.transfer_group_id
                    ? "bg-muted text-muted-foreground"
                    : t.amount > 0
                      ? "bg-money-in-soft text-money-in"
                      : "bg-money-out-soft text-money-out",
                )}
              >
                {t.transfer_group_id ? (
                  <ArrowLeftRight className="h-4 w-4" />
                ) : t.amount > 0 ? (
                  <ArrowDownLeft className="h-4 w-4" />
                ) : (
                  <ArrowUpRight className="h-4 w-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">
                    {t.note ||
                      t.category_name ||
                      (t.transfer_group_id
                        ? "Moved between accounts"
                        : t.amount > 0
                          ? "Money in"
                          : "Money out")}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>{formatDate(t.date)}</span>
                  <span aria-hidden>·</span>
                  <span className="truncate">{t.account_name}</span>
                  {t.category_name && (
                    <Badge variant="secondary" className="font-normal">
                      {t.category_name}
                    </Badge>
                  )}
                  {t.reconciliation_status === "matched" && (
                    <Badge variant="success" className="font-normal">
                      reconciled
                    </Badge>
                  )}
                </div>
              </div>
              <div
                className={cn(
                  "tabular shrink-0 font-semibold",
                  t.transfer_group_id
                    ? "text-muted-foreground"
                    : t.amount > 0
                      ? "text-money-in"
                      : "text-money-out",
                )}
              >
                {formatMoney(t.amount, { signed: true })}
              </div>
            </button>
          ))}
        </Card>
      )}

      {page && page.total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, page.total)} of {page.total}
          </span>
          <Button
            variant="outline"
            disabled={offset + PAGE_SIZE >= page.total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Next
          </Button>
        </div>
      )}

      <TransactionSheet
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        transaction={editing}
        onSaved={() => setLocalRevision((r) => r + 1)}
      />
    </div>
  );
}
