import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const CURRENT_YEAR = new Date().getFullYear();

export function OneClubScraper() {
  const [yearFrom, setYearFrom] = useState(CURRENT_YEAR - 1);
  const [yearTo, setYearTo] = useState(CURRENT_YEAR);
  const [oneShow, setOneShow] = useState(true);
  const [adc, setAdc] = useState(true);
  const [youngOnes, setYoungOnes] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<{ kind: "progress" | "warn" | "done" | "error"; text: string }[]>([]);

  async function run() {
    setRunning(true);
    setLog([]);
    try {
      const years: number[] = [];
      for (let y = yearFrom; y <= yearTo; y++) years.push(y);
      if (!years.length) { toast.error("Invalid year range"); setRunning(false); return; }

      const awards: string[] = [];
      if (oneShow) awards.push("one-show");
      if (adc) awards.push("adc");
      if (youngOnes) awards.push("young-ones");
      if (!awards.length) { toast.error("Pick at least one award type"); setRunning(false); return; }

      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape-oneclub`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token ?? ""}`,
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ years, awards }),
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
      <h2 className="text-2xl font-black tracking-tighter mb-1 font-serif">✦ The One Club — One Show & ADC</h2>
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-6">
        Scrapes oneclub.org award winners pages via __NEXT_DATA__ extraction
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
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Award shows</p>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 font-mono text-xs cursor-pointer">
              <input type="checkbox" checked={oneShow} onChange={(e) => setOneShow(e.target.checked)} /> One Show
            </label>
            <label className="flex items-center gap-2 font-mono text-xs cursor-pointer">
              <input type="checkbox" checked={adc} onChange={(e) => setAdc(e.target.checked)} /> ADC Annual Awards
            </label>
            <label className="flex items-center gap-2 font-mono text-xs cursor-pointer">
              <input type="checkbox" checked={youngOnes} onChange={(e) => setYoungOnes(e.target.checked)} /> Young Ones
            </label>
          </div>
        </div>

        <Button
          onClick={run}
          disabled={running}
          variant="outline"
          className="font-mono text-xs uppercase tracking-widest h-10 bg-background"
        >
          {running ? "Scraping…" : "Scrape The One Club"}
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
