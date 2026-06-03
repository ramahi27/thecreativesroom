import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function CannesLionsScraper() {
  const [yearFrom, setYearFrom] = useState(2010);
  const [yearTo, setYearTo] = useState(2025);
  const [grandPrix, setGrandPrix] = useState(true);
  const [gold, setGold] = useState(true);
  const [cFilm, setCFilm] = useState(true);
  const [cPrint, setCPrint] = useState(true);
  const [cPhoto, setCPhoto] = useState(true);
  const [cOutdoor, setCOutdoor] = useState(true);
  const [autoApprove, setAutoApprove] = useState(true);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<{ kind: "progress" | "warn" | "done" | "error"; text: string }[]>([]);

  async function run() {
    setRunning(true);
    setLog([]);
    try {
      const awardLevels: string[] = [];
      if (grandPrix) awardLevels.push("grand-prix");
      if (gold) awardLevels.push("gold");
      const categories: string[] = [];
      if (cFilm) categories.push("film");
      if (cPrint) categories.push("print");
      if (cPhoto) categories.push("photography");
      if (cOutdoor) categories.push("outdoor");
      if (!awardLevels.length || !categories.length) {
        toast.error("Pick at least one award level and category");
        setRunning(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape-cannes-lions`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token ?? ""}`,
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          yearFrom, yearTo, awardLevels, categories, autoApproveGrandPrix: autoApprove,
        }),
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
              setLog((l) => [...l, { kind: "done", text: `✓ Complete — ${s.total_fetched} fetched · ${s.auto_published} auto-published · ${s.sent_to_review} sent to review · ${s.skipped_duplicates} duplicates skipped` }]);
            } else if (ev.type === "error") {
              setLog((l) => [...l, { kind: "error", text: `✕ Scraper failed — ${ev.message}` }]);
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
      <h2 className="text-2xl font-black tracking-tighter mb-1 font-serif">✦ Cannes Lions — Grand Prix &amp; Gold Lions</h2>
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-6">
        Scrapes lovethework.com for award winners by category
      </p>

      <div className="border hairline p-6 space-y-6 bg-secondary/30">
        <div className="grid grid-cols-2 gap-4 max-w-xs">
          <div>
            <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Year from</Label>
            <Input type="number" value={yearFrom} min={1990} max={2025} onChange={(e) => setYearFrom(parseInt(e.target.value) || 2010)} className="bg-background border-0 font-mono mt-2" />
          </div>
          <div>
            <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Year to</Label>
            <Input type="number" value={yearTo} min={1990} max={2025} onChange={(e) => setYearTo(parseInt(e.target.value) || 2025)} className="bg-background border-0 font-mono mt-2" />
          </div>
        </div>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Award levels</p>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 font-mono text-xs cursor-pointer">
              <input type="checkbox" checked={grandPrix} onChange={(e) => setGrandPrix(e.target.checked)} /> Grand Prix
            </label>
            <label className="flex items-center gap-2 font-mono text-xs cursor-pointer">
              <input type="checkbox" checked={gold} onChange={(e) => setGold(e.target.checked)} /> Gold Lion
            </label>
          </div>
        </div>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Categories</p>
          <div className="grid grid-cols-2 gap-2 max-w-md">
            <label className="flex items-center gap-2 font-mono text-xs cursor-pointer">
              <input type="checkbox" checked={cFilm} onChange={(e) => setCFilm(e.target.checked)} /> Film &amp; Film Craft
            </label>
            <label className="flex items-center gap-2 font-mono text-xs cursor-pointer">
              <input type="checkbox" checked={cPrint} onChange={(e) => setCPrint(e.target.checked)} /> Print &amp; Publishing
            </label>
            <label className="flex items-center gap-2 font-mono text-xs cursor-pointer">
              <input type="checkbox" checked={cPhoto} onChange={(e) => setCPhoto(e.target.checked)} /> Photography
            </label>
            <label className="flex items-center gap-2 font-mono text-xs cursor-pointer">
              <input type="checkbox" checked={cOutdoor} onChange={(e) => setCOutdoor(e.target.checked)} /> Outdoor
            </label>
          </div>
        </div>

        <div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} />
            <span className="font-mono text-xs uppercase tracking-widest">Auto-publish Grand Prix winners</span>
          </label>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-1 ml-6">
            Grand Prix winners skip the review queue and go live immediately
          </p>
        </div>

        <Button
          onClick={run}
          disabled={running}
          variant="outline"
          className="font-mono text-xs uppercase tracking-widest h-10 bg-background"
        >
          {running ? "Scraping…" : "Scrape Cannes Lions"}
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
