import * as React from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  EyeOff,
  ListPlus,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useAppData } from "@/lib/store";
import { formatDate, formatMoney } from "@/lib/format";
import type { ReconciliationView } from "@/lib/types";

export function ReconcileDetail() {
  const { id } = useParams<{ id: string }>();
  const { categories, refresh } = useAppData();
  const toast = useToast();
  const [view, setView] = React.useState<ReconciliationView | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(() => {
    api
      .get<ReconciliationView>(`/reconcile/imports/${id}`)
      .then(setView)
      .catch(() => setView(null));
  }, [id]);

  React.useEffect(load, [load]);

  /**
   * How many rows of a bucket to render at once. A three-year statement is ~900
   * rows and each one carries a category dropdown, so rendering the lot locks up
   * the page on a phone. "Add all" handles the bulk case anyway; this list is for
   * reading, not for scrolling to the end.
   */
  const PAGE = 50;

  function ShowMore({
    state,
  }: {
    state: { more: () => void; hidden: number };
  }) {
    if (state.hidden === 0) return null;
    return (
      <div className="p-4 text-center sm:px-5">
        <Button variant="outline" onClick={state.more}>
          Show more ({state.hidden} not shown)
        </Button>
      </div>
    );
  }

  function useLimit(total: number) {
    const [limit, setLimit] = React.useState(PAGE);
    React.useEffect(() => setLimit(PAGE), [total]);
    return {
      limit,
      more: () => setLimit((n) => n + PAGE * 4),
      hidden: Math.max(0, total - limit),
    };
  }

  /** Every resolution action funnels through here so refresh/error handling is uniform. */
  async function act(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await fn();
      toast(message);
      load();
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Action failed", "error");
    } finally {
      setBusy(false);
    }
  }

  const missingLimit = useLimit(view?.missing_in_app.length ?? 0);
  const extraLimit = useLimit(view?.missing_in_statement.length ?? 0);
  const matchedLimit = useLimit(view?.matched.length ?? 0);
  const ignoredLimit = useLimit(view?.ignored_rows.length ?? 0);

  if (!view) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const { matched, missing_in_app, missing_in_statement, ignored_rows } = view;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/reconcile">
          <ArrowLeft /> All imports
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {view.import.filename}
          </h1>
          <p className="text-sm text-muted-foreground">
            {view.import.account_name} · {view.import.row_count} statement rows
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              act(
                () => api.post(`/reconcile/imports/${id}/rematch`),
                "Re-matched",
              )
            }
          >
            <RefreshCw /> Re-match
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (
                confirm(
                  "Delete this import? Transactions you created from it are kept.",
                )
              ) {
                act(
                  () => api.del(`/reconcile/imports/${id}`),
                  "Import deleted",
                ).then(() => {
                  window.location.href = "/reconcile";
                });
              }
            }}
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Summary label="Matched" count={matched.length} tone="success" />
        <Summary
          label="Missing entry"
          count={missing_in_app.length}
          tone="warn"
        />
        <Summary
          label="Not in statement"
          count={missing_in_statement.length}
          tone="warn"
        />
      </div>

      <Tabs defaultValue={missing_in_app.length ? "missing" : "matched"}>
        {/* Horizontally scrollable so four tabs still fit a narrow phone. */}
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="missing">
            Missing entry ({missing_in_app.length})
          </TabsTrigger>
          <TabsTrigger value="extra">
            Not in statement ({missing_in_statement.length})
          </TabsTrigger>
          <TabsTrigger value="matched">Matched ({matched.length})</TabsTrigger>
          <TabsTrigger value="ignored">
            Dismissed ({ignored_rows.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="missing">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                In the statement, not in the app
              </CardTitle>
              <CardDescription>
                You never logged these. Create the entry, or dismiss the row.
              </CardDescription>
              {/* Reviewing a first import one row at a time isn't realistic —
                  a year of statement is hundreds of rows. */}
              {missing_in_app.length > 1 && (
                <Button
                  className="mt-3 w-full sm:w-auto"
                  disabled={busy}
                  onClick={() => {
                    if (
                      !confirm(
                        `Add all ${missing_in_app.length} of these to your history?\n\nThey'll be uncategorised, with the bank's description as the note. You can edit or delete any of them afterwards.`,
                      )
                    )
                      return;
                    act(
                      () => api.post(`/reconcile/imports/${id}/create-missing`),
                      `Added ${missing_in_app.length} entries`,
                    );
                  }}
                >
                  <ListPlus />
                  {busy
                    ? "Adding…"
                    : `Add all ${missing_in_app.length} to my history`}
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {missing_in_app.length === 0 ? (
                <Empty>
                  Nothing missing — every statement row found a match.
                </Empty>
              ) : (
                <>
                  <ul className="divide-y border-t">
                    {missing_in_app.slice(0, missingLimit.limit).map((row) => (
                      <li key={row.id} className="space-y-2 p-4 sm:px-5">
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">
                              {row.description || "(no description)"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatDate(row.date)}
                            </div>
                          </div>
                          <span className="tabular shrink-0 font-semibold">
                            {formatMoney(row.amount, { signed: true })}
                          </span>
                        </div>
                        <CreateEntry
                          busy={busy}
                          categories={categories}
                          onCreate={(categoryId) =>
                            act(
                              () =>
                                api.post(
                                  `/reconcile/rows/${row.id}/create-entry`,
                                  {
                                    category_id: categoryId,
                                  },
                                ),
                              "Entry created",
                            )
                          }
                          onIgnore={() =>
                            act(
                              () =>
                                api.post(`/reconcile/rows/${row.id}/ignore`),
                              "Row dismissed",
                            )
                          }
                        />
                      </li>
                    ))}
                  </ul>
                  <ShowMore state={missingLimit} />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="extra">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                In the app, not in the statement
              </CardTitle>
              <CardDescription>
                Possible duplicate, typo, or something that simply hasn't
                cleared yet.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {missing_in_statement.length === 0 ? (
                <Empty>Everything you logged appears in the statement.</Empty>
              ) : (
                <>
                  <ul className="divide-y border-t">
                    {missing_in_statement
                      .slice(0, extraLimit.limit)
                      .map((t) => (
                        <li
                          key={t.id}
                          className="flex flex-wrap items-center gap-3 p-4 sm:px-5"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">
                              {t.note || t.category_name || "Transaction"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatDate(t.date)}
                              {t.category_name ? ` · ${t.category_name}` : ""}
                            </div>
                          </div>
                          <span className="tabular font-semibold">
                            {formatMoney(t.amount, { signed: true })}
                          </span>
                          <div className="flex w-full gap-2 sm:w-auto">
                            <Button
                              variant="outline"
                              size="sm"
                              asChild
                              className="flex-1 sm:flex-none"
                            >
                              <Link to="/transactions">Review</Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              className="flex-1 sm:flex-none"
                              onClick={() =>
                                act(
                                  () =>
                                    api.post(
                                      `/reconcile/transactions/${t.id}/ignore`,
                                    ),
                                  "Flag dismissed",
                                )
                              }
                            >
                              <EyeOff /> Dismiss
                            </Button>
                          </div>
                        </li>
                      ))}
                  </ul>
                  <ShowMore state={extraLimit} />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="matched">
          <Card>
            <CardContent className="p-0">
              {matched.length === 0 ? (
                <Empty>No rows matched yet.</Empty>
              ) : (
                <>
                  <ul className="divide-y">
                    {matched.slice(0, matchedLimit.limit).map((row) => (
                      <li
                        key={row.id}
                        className="flex items-center gap-3 p-4 sm:px-5"
                      >
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">
                            {row.description || "(no description)"}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {formatDate(row.date)} → matched “
                            {row.matched_note ||
                              row.matched_category ||
                              "entry"}
                            ”
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="tabular font-semibold">
                            {formatMoney(row.amount, { signed: true })}
                          </div>
                          <Badge
                            variant="secondary"
                            className="mt-0.5 font-normal"
                          >
                            {Math.round(row.match_confidence * 100)}%
                          </Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <ShowMore state={matchedLimit} />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ignored">
          <Card>
            <CardContent className="p-0">
              {ignored_rows.length === 0 ? (
                <Empty>Nothing dismissed.</Empty>
              ) : (
                <>
                  <ul className="divide-y">
                    {ignored_rows.slice(0, ignoredLimit.limit).map((row) => (
                      <li
                        key={row.id}
                        className="flex items-center gap-3 p-4 sm:px-5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate">
                            {row.description || "(no description)"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatDate(row.date)}
                          </div>
                        </div>
                        <span className="tabular">
                          {formatMoney(row.amount, { signed: true })}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            act(
                              () =>
                                api.post(`/reconcile/rows/${row.id}/unignore`),
                              "Row restored",
                            )
                          }
                        >
                          Restore
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <ShowMore state={ignoredLimit} />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CreateEntry({
  categories,
  onCreate,
  onIgnore,
  busy,
}: {
  categories: { id: number; name: string }[];
  onCreate: (categoryId: number | null) => void;
  onIgnore: () => void;
  busy: boolean;
}) {
  const [categoryId, setCategoryId] = React.useState<string>("");

  return (
    <div className="flex flex-wrap gap-2">
      <Select value={categoryId} onValueChange={setCategoryId}>
        <SelectTrigger className="h-9 w-full sm:w-44">
          <SelectValue placeholder="Category (optional)" />
        </SelectTrigger>
        <SelectContent>
          {categories.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        className="flex-1 sm:flex-none"
        disabled={busy}
        onClick={() => onCreate(categoryId ? Number(categoryId) : null)}
      >
        <Plus /> Create entry
      </Button>
      <Button variant="ghost" size="sm" disabled={busy} onClick={onIgnore}>
        <EyeOff /> Dismiss
      </Button>
    </div>
  );
}

function Summary({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "success" | "warn";
}) {
  const flagged = tone === "warn" && count > 0;
  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        {/* The label wraps rather than truncating — "Not in statement" does not
            fit one line on a narrow phone, and "Not in st…" tells you nothing. */}
        <div className="flex items-start gap-1.5 text-xs leading-tight text-muted-foreground">
          {flagged ? (
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" />
          )}
          <span className="min-h-[2.25em]">{label}</span>
        </div>
        <div className="tabular mt-1 text-2xl font-semibold">{count}</div>
      </CardContent>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="p-8 text-center text-sm text-muted-foreground">{children}</p>
  );
}
