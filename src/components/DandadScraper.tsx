import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type LogLine = { kind: "progress" | "warn" | "done" | "error"; text: string };

const CURRENT_YEAR = new Date().getFullYear();

export function DandadScraper() {
  const [year, setYear]         = useState(CURRENT_YEAR);
  const [category, setCategory] = useState("");
  const [running, setRunning]   = useState(false);
  const [log, setLog]           = useState<LogLine[]>([]);

  async function run() {
    setRunning(true);
    setLog([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape-dandad`;
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ year, category: category.trim() || null }),
      });
      if (!resp.ok || !resp.body) {
        const t = await resp.text().catch(() => "");
        setLog((l) => [...l, { kind: "error", text: `✕ Failed (${resp.status}) ${t}` }]);
        setRunning(false);
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const ev = JSON.parse(line);
            if (ev.type === "progress") {
              setLog((l) => [...l, { kind: "progress", text: `● ${ev.message}` }]);
            } else if (ev.type === "warn") {
              setLog((l) => [...l, { kind: "warn", text: `⚠ ${ev.message}` }]);
            } else if (ev.type === "done") {
              setLog((l) => [...l, { kind: "done", text: `✓ Done — ${ev.inserted} inserted, ${ev.skipped} skipped` }]);
              toast.success(`Imported ${ev.inserted} D&AD winners`);
            } else if (ev.type === "error") {
              setLog((l) => [...l, { kind: "error", text: `✕ ${ev.message}` }]);
              toast.error(ev.message);
            }
          } catch { /* ignore */ }
        }
      }
    } catch (e: any) {
      setLog((l) => [...l, { kind: "error", text: `✕ ${e?.message || String(e)}` }]);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-mono text-xs uppercase tracking-widest">✦ D&AD winners</h3>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Scrape D&AD professional awards winners by year
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="space-y-1">
          <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Year</label>
          <Input
            type="number"
            min={2000}
            max={CURRENT_YEAR}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            disabled={running}
            className="bg-secondary border-0 font-mono w-28"
          />
        </div>
        <div className="flex-1 space-y-1">
          <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Category filter <span className="normal-case tracking-normal">(optional)</span>
          </label>
          <Input
            type="text"
            placeholder="e.g. Advertising, Photography, Typography"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={running}
            className="bg-secondary border-0 font-mono"
          />
        </div>
        <div className="flex items-end">
          <Button onClick={run} disabled={running} className="font-mono text-xs uppercase tracking-widest">
            {running ? "Scraping…" : "Scrape D&AD"}
          </Button>
        </div>
      </div>

      {log.length > 0 && (
        <div className="border hairline bg-muted/40 p-3 max-h-60 overflow-auto font-mono text-[11px] leading-relaxed">
          {log.map((l, i) => (
            <div
              key={i}
              className={
                l.kind === "error" ? "text-destructive"
                : l.kind === "warn" ? "text-amber-600 dark:text-amber-400"
                : l.kind === "done" ? "text-primary"
                : "text-foreground"
              }
            >
              {l.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
