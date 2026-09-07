import * as React from "react";
import { Link } from "react-router-dom";
import { FileUp, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
import { formatDate } from "@/lib/format";
import type { StatementImport } from "@/lib/types";

export function Reconcile() {
  const { accounts } = useAppData();
  const toast = useToast();
  const [imports, setImports] = React.useState<StatementImport[] | null>(null);
  const [accountId, setAccountId] = React.useState<string>("");
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const bankAccounts = accounts.filter((a) => !a.archived);

  const load = React.useCallback(() => {
    api.get<StatementImport[]>("/reconcile/imports").then(setImports).catch(() => setImports([]));
  }, []);

  React.useEffect(load, [load]);

  React.useEffect(() => {
    if (!accountId && bankAccounts.length) setAccountId(String(bankAccounts[0].id));
  }, [accountId, bankAccounts]);

  async function upload(file: File) {
    if (!accountId) {
      toast("Pick the account this statement belongs to", "error");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("account_id", accountId);
      const res = await api.upload<{ id: number; row_count: number }>("/reconcile/imports", form);
      toast(`Imported ${res.row_count} rows`);
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not import statement", "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Check your statement</h1>
        <p className="text-sm text-muted-foreground">
          Upload the statement you downloaded from your bank and see what you forgot to log.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload a statement</CardTitle>
          <CardDescription>
            CSV only for now. An ICICI internet-banking export works as downloaded — the
            columns are detected automatically, extra header lines and all.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Account</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Choose an account" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name} ({a.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
            }}
          />
          <Button
            size="lg"
            className="w-full"
            disabled={uploading || !accountId}
            onClick={() => fileRef.current?.click()}
          >
            <Upload />
            {uploading ? "Importing…" : "Choose CSV file"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Past imports</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!imports ? (
            <p className="p-5 text-sm text-muted-foreground">Loading…</p>
          ) : imports.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <FileUp className="mx-auto mb-2 h-6 w-6" />
              No statements imported yet.
            </div>
          ) : (
            <ul className="divide-y border-t">
              {imports.map((imp) => (
                <li key={imp.id}>
                  <Link
                    to={`/reconcile/${imp.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50 sm:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{imp.filename}</div>
                      <div className="text-xs text-muted-foreground">
                        {imp.account_name} · {imp.row_count} rows ·{" "}
                        {formatDate(imp.uploaded_at.slice(0, 10))}
                      </div>
                    </div>
                    {imp.unmatched_count > 0 ? (
                      <Badge variant="destructive">{imp.unmatched_count} to review</Badge>
                    ) : (
                      <Badge variant="success">clear</Badge>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
