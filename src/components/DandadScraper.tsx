import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const CURRENT_YEAR = new Date().getFullYear();

export function DandadScraper() {
  const [yearFrom, setYearFrom] = useState(CURRENT_YEAR - 1);
  const [yearTo, setYearTo] = useState(CURRENT_YEAR);
  const [black, setBlack] = useState(true);
  const [yellow, setYellow] = useState(true);
  const [graphite, setGraphite] = useState(false);
  const [wood, setWood] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<{ kind: "progress" | "warn" | "done" | "error"; text: string }[]>([]);

  async function run() {
    setRunning(true);
    setLog([]);
    try {
      const years: number[] = [];
      for (let y = yearFrom; y <= yearTo; y++) years.push(y);
      if (!years.length) { toast.error("Invalid year range"); setRunning(false); return; }

      const awardLevels: string[] = [];
      if (black) awardLevels.push("black");
      if (yellow) awardLevels.push("yellow");
      if (graphite) awardLevels.push("graphite");
      if (wood) awardLevels.push("wood");

      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape-dandad`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token ?? ""}`,
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ years, awardLevels }),
      });
      if (!resp.ok || !resp.body) {
        const t = await resp.text().catch(() => "");
        setLog((l) => [...l, { kind: "error", text: `✕ Scraper failed (${resp.status}) ${t}` }]);
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
              const s = ev.summary;
              setLog((l) => [...l, { kind: "done", text: `✓ Complete — ${s.total_fetched} fetched · ${s.saved} saved · ${s.skipped_duplicates} duplicates · ${s.errors} errors` }]);
            } else if (ev.type === "error") {
              setLog((l) => [...l, { kind: "error", text: `✕ ${ev.message}` }]);
            }
          } catch { /* ignore */ }
        }
      }
    } catch (e: any) {
      setLog((l) => [...l, { kind: "error", text: `✕ Scraper failed — ${e.message ?? "unknown"}` }]);
    } finally {
      setRunning(false);
    }
  }

  return (
    <section>
      <h2 className="text-2xl font-black tracking-tighter mb-1 font-serif">✦ D&AD — Pencil Winners</h2>
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-6">
        Scrapes dandad.org winners pages via __NEXT_DATA__ extraction
      </p>

      <div className="border hairline p-6 space-y-6 bg-secondary/30">
        <div className="grid grid-cols-2 gap-4 max-w-xs">
          <div>
            <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Year from</Label>
            <Input type="number" value={yearFrom} min={2000} max={CURRENT_YEAR} onChange={(e) => setYearFrom(parseInt(e.target.value) || CURRENT_YEAR - 1)} className="bg-background border-0 font-mono mt-2" />
          </div>
          <div>
            <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Year to</Label>
            <Input type="number" value={yearTo} min={2000} max={CURRENT_YEAR} onChange={(e) => setYearTo(parseInt(e.target.value) || CURRENT_YEAR)} className="bg-background border-0 font-mono mt-2" />
          </div>
        </div>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Award levels</p>
          <div className="grid grid-cols-2 gap-2 max-w-xs">
            <label className="flex items-center gap-2 font-mono text-xs cursor-pointer">
              <input type="checkbox" checked={black} onChange={(e) => setBlack(e.target.checked)} /> Black Pencil
            </label>
            <label className="flex items-center gap-2 font-mono text-xs cursor-pointer">
              <input type="checkbox" checked={yellow} onChange={(e) => setYellow(e.target.checked)} /> Yellow Pencil
            </label>
            <label className="flex items-center gap-2 font-mono text-xs cursor-pointer">
              <input type="checkbox" checked={graphite} onChange={(e) => setGraphite(e.target.checked)} /> Graphite Pencil
            </label>
            <label className="flex items-center gap-2 font-mono text-xs cursor-pointer">
              <input type="checkbox" checked={wood} onChange={(e) => setWood(e.target.checked)} /> Wood Pencil
            </label>
          </div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-2">
            Leave all unchecked to fetch all levels
          </p>
        </div>

        <Button
          onClick={run}
          disabled={running}
          variant="outline"
          className="font-mono text-xs uppercase tracking-widest h-10 bg-background"
        >
          {running ? "Scraping…" : "Scrape D&AD"}
        </Button>

        {log.length > 0 && (
          <div className="border-t hairline pt-4 space-y-1 max-h-72 overflow-y-auto font-mono text-[11px]">
            {log.map((l, i) => (
              <p
                key={i}
                className={
                  l.kind === "done" ? "text-primary" :
                  l.kind === "error" ? "text-destructive" :
                  l.kind === "warn" ? "text-muted-foreground" :
                  ""
                }
              >
                {l.text}
              </p>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
