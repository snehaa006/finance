import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import { formatDateShort, formatMoney, formatMonth, monthsAgo, startOfMonth, today } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DashboardData } from "@/lib/types";

const RANGES = [
  { value: "3", label: "Last 3 months" },
  { value: "6", label: "Last 6 months" },
  { value: "12", label: "Last 12 months" },
  { value: "month", label: "This month" },
];

const SERIES = { income: "var(--chart-1)", expense: "var(--chart-2)" };
const IN_LABEL = "Money in";
const OUT_LABEL = "Money out";

export function Dashboard() {
  const { revision } = useAppData();
  const [range, setRange] = React.useState("6");
  const [data, setData] = React.useState<DashboardData | null>(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const start = range === "month" ? startOfMonth() : monthsAgo(Number(range) - 1);
    api
      .get<DashboardData>(`/dashboard${qs({ start, end: today() })}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [range, revision]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return <DashboardSkeleton />;

  const net = data.this_month.income - data.this_month.expense;

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your money</h1>
          <p className="text-sm text-muted-foreground">Where things stand today.</p>
        </div>
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
          <CardTitle className="tabular text-3xl sm:text-4xl">
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
          icon={ArrowDownLeft}
          tone="in"
        />
        <Stat
          label="Money out this month"
          value={data.this_month.expense}
          icon={ArrowUpRight}
          tone="out"
        />
        <Stat
          label="Left over this month"
          value={net}
          icon={net >= 0 ? TrendingUp : TrendingDown}
          signed
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your money over time</CardTitle>
          <CardDescription>Bank and cash added together.</CardDescription>
        </CardHeader>
        <CardContent className="h-64 pl-0">
          {data.net_worth_series.length < 2 ? (
            <ChartEmpty>Log a few transactions to see the trend.</ChartEmpty>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.net_worth_series} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
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
                        label={String(label)}
                        rows={[
                          { name: "Total money", value: Number(payload[0].value), color: "var(--chart-1)" },
                        ]}
                      />
                    ) : null
                  }
                />
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
              Month by month. Money you shift between your own accounts isn't counted.
            </CardDescription>
            <div className="pt-1">
              <ChartLegend
                items={[
                  { name: IN_LABEL, color: SERIES.income },
                  { name: OUT_LABEL, color: SERIES.expense },
                ]}
              />
            </div>
          </CardHeader>
          <CardContent className="h-64 pl-0">
            {data.monthly.length === 0 ? (
              <ChartEmpty>Nothing in this range yet.</ChartEmpty>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthly} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={formatMonth}
                    tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
                    tickLine={false}
                    axisLine={false}
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
                          rows={payload.map((p) => ({
                            name: p.dataKey === "income" ? IN_LABEL : OUT_LABEL,
                            value: Number(p.value),
                            color: p.dataKey === "income" ? SERIES.income : SERIES.expense,
                          }))}
                        />
                      ) : null
                    }
                  />
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
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Where the money went</CardTitle>
            <CardDescription>Biggest spends first, over the range above.</CardDescription>
          </CardHeader>
          <CardContent className="h-64 pl-0">
            {data.spending_by_category.length === 0 ? (
              <ChartEmpty>No spending recorded in this range.</ChartEmpty>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                {/* A ranked bar chart rather than a pie: length compares far more
                    accurately than angle, and one hue sidesteps needing a
                    distinct colour per category. */}
                <BarChart
                  layout="vertical"
                  data={data.spending_by_category.slice(0, 8)}
                  margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
                >
                  <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => formatMoney(v, { compact: true })}
                    tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="category"
                    width={92}
                    tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--chart-grid)", fillOpacity: 0.35 }}
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <ChartTooltip
                          label={String(payload[0].payload.category)}
                          rows={[
                            {
                              name: `${payload[0].payload.count} transaction${payload[0].payload.count === 1 ? "" : "s"}`,
                              value: Number(payload[0].value),
                              color: "var(--chart-2)",
                            },
                          ]}
                        />
                      ) : null
                    }
                  />
                  <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
                    {data.spending_by_category.slice(0, 8).map((d) => (
                      <Cell key={d.category} fill="var(--chart-2)" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
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
  icon: Icon,
  signed,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  signed?: boolean;
  tone?: "in" | "out";
}) {
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
          <div className="tabular text-lg font-semibold">
            {signed ? formatMoney(value, { signed: true }) : formatMoney(value)}
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
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
