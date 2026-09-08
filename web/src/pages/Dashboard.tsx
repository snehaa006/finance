import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Landmark,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChartEmpty, ChartLegend, ChartTooltip } from "@/components/charts";
import { api, qs } from "@/lib/api";
import { useAppData } from "@/lib/store";
import {
  formatDate,
  formatDateShort,
  formatMoney,
  formatMonth,
  monthsAgo,
  startOfMonth,
  today,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DashboardData } from "@/lib/types";

const RANGES = [
  { value: "3", label: "Last 3 months" },
  { value: "6", label: "Last 6 months" },
  { value: "12", label: "Last 12 months" },
  { value: "month", label: "This month" },
];

/** The two hues carry identity (in vs out). Ink is not a third series — it is
 *  the derived "left over" figure and the zero rule, and it is always paired
 *  with a mark shape of its own (a line, not a bar) plus a legend label. */
const SERIES = {
  income: "var(--chart-1)",
  expense: "var(--chart-2)",
  net: "var(--chart-ink)",
};
const IN_LABEL = "Money in";
const OUT_LABEL = "Money out";
const NET_LABEL = "Left over";

/** Ranked spending is folded past this point so nothing is silently dropped. */
const TOP_CATEGORIES = 7;

export function Dashboard() {
  const { revision } = useAppData();
  const [range, setRange] = React.useState("6");
  const [data, setData] = React.useState<DashboardData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const start = range === "month" ? startOfMonth() : monthsAgo(Number(range) - 1);
    let live = true;
    setLoading(true);
    api
      .get<DashboardData>(`/dashboard${qs({ start, end: today() })}`)
      .then((d) => {
        if (!live) return;
        setData(d);
        setError("");
      })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [range, revision]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return <DashboardSkeleton />;

  const net = data.this_month.income - data.this_month.expense;
  const prevNet = data.prev_month.income - data.prev_month.expense;
  const rangeLabel = RANGES.find((r) => r.value === range)?.label.toLowerCase() ?? "";

  // Headline for the trend card: where the balance ended up versus where the
  // window opened. Reading it off the chart's own endpoints keeps the sentence
  // and the line telling the same story.
  const series = data.net_worth_series;
  const openingValue = series[0]?.value ?? 0;
  const change = data.net_worth - openingValue;
  const hasTrend =
    series.length > 2 || series.some((p) => p.value !== openingValue);
  const dipsBelowZero = series.some((p) => p.value < 0);

  // Every bar keeps its own place in the ranking; the long tail becomes one
  // honest "Everything else" bar rather than being cut off the chart.
  const spending = data.spending_by_category;
  const spendingTotal = spending.reduce((s, d) => s + d.total, 0);
  const ranked = spending.slice(0, TOP_CATEGORIES);
  const tail = spending.slice(TOP_CATEGORIES);
  const spendingRows = tail.length
    ? [
        ...ranked,
        {
          category: "Everything else",
          category_id: null,
          total: tail.reduce((s, d) => s + d.total, 0),
          count: tail.reduce((s, d) => s + d.count, 0),
        },
      ]
    : ranked;

  const monthly = data.monthly.map((m) => ({ ...m, net: m.income - m.expense }));
  const monthlyHasNegative = monthly.some((m) => m.net < 0);

  return (
    // A refetch holds the previous render at reduced opacity rather than
    // collapsing back to skeletons, so switching range never jumps the layout.
    <div
      className={cn(
        "space-y-4 transition-opacity md:space-y-6",
        loading && "opacity-60",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your money</h1>
          <p className="text-sm text-muted-foreground">Where things stand today.</p>
        </div>
        {/* One range control above everything it scopes — the charts below all
            read the same slice. */}
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Hero number first: net worth is the one figure worth reading at a glance. */}
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Total money you have</CardDescription>
          <CardTitle className="text-3xl sm:text-4xl">
            {formatMoney(data.net_worth)}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 pt-2">
          <Split icon={Landmark} label="In the bank" value={data.bank_total} />
          <Split icon={Banknote} label="Cash in hand" value={data.cash_total} />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Money in this month"
          value={data.this_month.income}
          previous={data.prev_month.income}
          icon={ArrowDownLeft}
          tone="in"
          betterWhen="up"
        />
        <Stat
          label="Money out this month"
          value={data.this_month.expense}
          previous={data.prev_month.expense}
          icon={ArrowUpRight}
          tone="out"
          betterWhen="down"
        />
        <Stat
          label="Left over this month"
          value={net}
          previous={prevNet}
          icon={net >= 0 ? TrendingUp : TrendingDown}
          signed
          betterWhen="up"
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <div>
              <CardTitle className="text-base">Your money over time</CardTitle>
              <CardDescription>Bank and cash added together.</CardDescription>
            </div>
            {/* The one number the line is there to show, said in words as well,
                so the story does not depend on reading the slope. */}
            {hasTrend && (
              <div className="text-right">
                <div
                  className={cn(
                    "tabular flex items-center justify-end gap-1 text-sm font-semibold",
                    change > 0
                      ? "text-money-in"
                      : change < 0
                        ? "text-money-out"
                        : "text-muted-foreground",
                  )}
                >
                  {change > 0 ? (
                    <TrendingUp className="h-4 w-4" />
                  ) : change < 0 ? (
                    <TrendingDown className="h-4 w-4" />
                  ) : (
                    <Minus className="h-4 w-4" />
                  )}
                  {change === 0 ? "No change" : formatMoney(change, { signed: true })}
                </div>
                <div className="text-xs text-muted-foreground">{rangeLabel}</div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="h-64 pl-0">
          {!hasTrend ? (
            <ChartEmpty>Log a few transactions to see the trend.</ChartEmpty>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDateShort}
                  tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                />
                <YAxis
                  width={64}
                  tickFormatter={(v) => formatMoney(v, { compact: true })}
                  tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ stroke: "var(--chart-axis)", strokeDasharray: "3 3" }}
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <ChartTooltip
                        label={formatDate(String(label))}
                        rows={[
                          { name: "Total money", value: Number(payload[0].value), color: "var(--chart-1)" },
                        ]}
                      />
                    ) : null
                  }
                />
                {/* Only drawn when the balance actually goes negative — an
                    always-on zero rule on a chart that never approaches it is
                    just another gridline. */}
                {dipsBelowZero && (
                  <ReferenceLine y={0} stroke="var(--chart-ink)" strokeWidth={1} />
                )}
                {/* stepAfter, not a smooth curve: a balance holds flat until the
                    next transaction, and an interpolated curve would imply
                    movement on days nothing happened. */}
                <Area
                  type="stepAfter"
                  dataKey="value"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  isAnimationActive={false}
                  fill="url(#netWorthFill)"
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Money in vs money out</CardTitle>
            <CardDescription>
              Month by month, with what you kept. Money you shift between your own
              accounts isn't counted.
            </CardDescription>
            <div className="pt-1">
              <ChartLegend
                items={[
                  { name: IN_LABEL, color: SERIES.income },
                  { name: OUT_LABEL, color: SERIES.expense },
                  { name: NET_LABEL, color: SERIES.net },
                ]}
              />
            </div>
          </CardHeader>
          <CardContent className="h-64 pl-0">
            {monthly.length === 0 ? (
              <ChartEmpty>Nothing in this range yet.</ChartEmpty>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                {/* The bars answer "how much moved"; the line answers "did I
                    keep any of it" — the question the two bars only imply. Same
                    unit, same axis, so no second scale is invented. */}
                <ComposedChart data={monthly} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={formatMonth}
                    tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={8}
                  />
                  <YAxis
                    width={64}
                    tickFormatter={(v) => formatMoney(v, { compact: true })}
                    tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--chart-grid)", fillOpacity: 0.35 }}
                    content={({ active, payload, label }) =>
                      active && payload?.length ? (
                        <ChartTooltip
                          label={formatMonth(String(label))}
                          rows={[
                            {
                              name: IN_LABEL,
                              value: Number(payload[0].payload.income),
                              color: SERIES.income,
                            },
                            {
                              name: OUT_LABEL,
                              value: Number(payload[0].payload.expense),
                              color: SERIES.expense,
                            },
                            {
                              name: NET_LABEL,
                              value: Number(payload[0].payload.net),
                              color: SERIES.net,
                            },
                          ]}
                        />
                      ) : null
                    }
                  />
                  {/* A month that spends more than it earns crosses this line,
                      which is the whole point of drawing the net at all. */}
                  {monthlyHasNegative && (
                    <ReferenceLine y={0} stroke="var(--chart-ink)" strokeWidth={1} />
                  )}
                  {/* Animation is off across the dashboard: Recharts replays it on
                      every ResponsiveContainer resize, which reads as flicker when a
                      phone rotates or the keyboard opens. */}
                  <Bar
                    dataKey="income"
                    fill={SERIES.income}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={22}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="expense"
                    fill={SERIES.expense}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={22}
                    isAnimationActive={false}
                  />
                  <Line
                    type="linear"
                    dataKey="net"
                    stroke={SERIES.net}
                    strokeWidth={2}
                    isAnimationActive={false}
                    dot={{ r: 3, fill: SERIES.net, stroke: "var(--card)", strokeWidth: 2 }}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)" }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Where the money went</CardTitle>
            <CardDescription>
              {spendingTotal > 0
                ? `${formatMoney(spendingTotal)} spent, biggest first.`
                : "Biggest spends first, over the range above."}
            </CardDescription>
          </CardHeader>
          <CardContent className="pl-0">
            {spendingRows.length === 0 ? (
              <ChartEmpty>No spending recorded in this range.</ChartEmpty>
            ) : (
              // Height follows the number of bars instead of a fixed box, so a
              // short list is not stranded in whitespace and a long one is not
              // squeezed into a nested scroll.
              <div style={{ height: Math.max(160, spendingRows.length * 34 + 32) }}>
                <ResponsiveContainer width="100%" height="100%">
                  {/* A ranked bar chart rather than a pie: length compares far more
                      accurately than angle, and one hue sidesteps needing a
                      distinct colour per category. */}
                  <BarChart
                    layout="vertical"
                    data={spendingRows}
                    margin={{ top: 0, right: 68, bottom: 0, left: 0 }}
                  >
                    {/* No gridlines: the x-axis is hidden and every bar carries
                        its own value, so a grid would measure nothing. */}
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="category"
                      width={96}
                      tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--chart-grid)", fillOpacity: 0.35 }}
                      content={({ active, payload }) =>
                        active && payload?.length ? (
                          <ChartTooltip
                            label={
                              payload[0].payload.category === "Everything else"
                                ? `Everything else (${tail.length} categories)`
                                : String(payload[0].payload.category)
                            }
                            rows={[
                              {
                                name: `${payload[0].payload.count} entr${payload[0].payload.count === 1 ? "y" : "ies"} · ${share(Number(payload[0].value), spendingTotal)}`,
                                value: Number(payload[0].value),
                                color: "var(--chart-2)",
                              },
                            ]}
                          />
                        ) : null
                      }
                    />
                    <Bar
                      dataKey="total"
                      fill="var(--chart-2)"
                      radius={[0, 4, 4, 0]}
                      maxBarSize={18}
                      isAnimationActive={false}
                    >
                      {/* The x-axis is hidden because each bar carries its own
                          amount — the value is readable without a hover. */}
                      <LabelList
                        dataKey="total"
                        position="right"
                        offset={8}
                        fontSize={11}
                        fill="var(--chart-axis)"
                        formatter={(v: number) => formatMoney(v, { compact: true })}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Biggest spends this month</CardTitle>
          </CardHeader>
          <CardContent>
            {data.top_categories_this_month.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing spent this month yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.top_categories_this_month.map((c, i) => (
                  <li key={c.category} className="flex items-center gap-3 text-sm">
                    <span className="w-5 text-muted-foreground tabular">{i + 1}.</span>
                    <span className="flex-1 truncate">{c.category}</span>
                    <span className="tabular font-medium">{formatMoney(c.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">What's in each place</CardTitle>
          </CardHeader>
          <CardContent>
            {data.accounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add an account to get started.</p>
            ) : (
              <ul className="space-y-2">
                {data.accounts.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 text-sm">
                    {a.type === "cash" ? (
                      <Banknote className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Landmark className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="flex-1 truncate">{a.name}</span>
                    <span className="tabular font-medium">{formatMoney(a.balance)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function share(value: number, total: number): string {
  if (total <= 0) return "—";
  return `${Math.round((value / total) * 100)}% of spending`;
}

function Split({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="tabular mt-1 text-lg font-semibold">{formatMoney(value)}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  previous,
  icon: Icon,
  signed,
  tone,
  betterWhen,
}: {
  label: string;
  value: number;
  previous: number;
  icon: React.ComponentType<{ className?: string }>;
  signed?: boolean;
  tone?: "in" | "out";
  /** Which direction of change counts as good news for this figure. */
  betterWhen: "up" | "down";
}) {
  const diff = value - previous;
  // A percentage off a zero baseline is meaningless, so the first month with a
  // figure says "new" rather than "+∞%".
  const pct = previous !== 0 ? Math.round((diff / Math.abs(previous)) * 100) : null;
  const good = betterWhen === "up" ? diff > 0 : diff < 0;

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={cn(
            "rounded-lg p-2",
            tone === "in"
              ? "bg-money-in-soft text-money-in"
              : tone === "out"
                ? "bg-money-out-soft text-money-out"
                : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold">
            {signed ? formatMoney(value, { signed: true }) : formatMoney(value)}
          </div>
          {/* Context, not decoration: a figure for "this month" means little
              without the month before it to sit against. */}
          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            {diff === 0 ? (
              <>
                <Minus className="h-3 w-3" />
                <span>Same as last month</span>
              </>
            ) : (
              <>
                {diff > 0 ? (
                  <ArrowUpRight className={cn("h-3 w-3", good ? "text-money-in" : "text-money-out")} />
                ) : (
                  <ArrowDownLeft className={cn("h-3 w-3", good ? "text-money-in" : "text-money-out")} />
                )}
                <span className="tabular truncate">
                  {pct === null
                    ? formatMoney(diff, { signed: true, compact: true })
                    : `${diff > 0 ? "+" : "−"}${Math.abs(pct)}%`}{" "}
                  vs last month
                </span>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-36 w-full" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
