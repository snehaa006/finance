import * as React from "react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";

/**
 * Shared chart chrome. Every chart in the app renders through these so the
 * tooltip, legend and empty state stay identical across screens.
 */

export function ChartTooltip({
  label,
  rows,
}: {
  label: string;
  rows: { name: string; value: number; color: string }[];
}) {
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium text-popover-foreground">{label}</div>
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-2 text-muted-foreground">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-[2px]"
            style={{ background: r.color }}
          />
          <span className="flex-1">{r.name}</span>
          <span className="tabular font-medium text-popover-foreground">
            {formatMoney(r.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Identity is never carried by color alone — the swatch always has a label. */
export function ChartLegend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.name} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2 w-2 rounded-[2px]"
            style={{ background: i.color }}
          />
          {i.name}
        </span>
      ))}
    </div>
  );
}

export function ChartEmpty({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex h-full min-h-[180px] items-center justify-center text-center text-sm text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}
