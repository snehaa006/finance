import * as React from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Toast = { id: number; message: string; variant: "success" | "error" };

const ToastContext = React.createContext<(message: string, variant?: Toast["variant"]) => void>(
  () => {},
);

export function useToast() {
  return React.useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const push = React.useCallback((message: string, variant: Toast["variant"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, variant }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      {/* Above the mobile bottom nav, out of the way of the desktop layout. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-center gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg animate-in slide-in-from-bottom-2",
              t.variant === "error"
                ? "border-destructive/30 bg-destructive text-destructive-foreground"
                : "border-border bg-card text-card-foreground",
            )}
          >
            {t.variant === "error" ? (
              <XCircle className="h-4 w-4 shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            )}
            <span className="flex-1">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
