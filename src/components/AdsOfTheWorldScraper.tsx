import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function AdsOfTheWorldScraper() {
  const [print, setPrint] = useState(true);
  const [outdoor, setOutdoor] = useState(true);
  const [film, setFilm] = useState(false);
  const [digital, setDigital] = useState(false);
  const [pages, setPages] = useState(2);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<{ kind: "progress" | "warn" | "done" | "error"; text: string }[]>([]);

  async function run() {
    setRunning(true);
    setLog([]);
    try {
      const mediums: string[] = [];
      if (print) mediums.push("print");
      if (outdoor) mediums.push("outdoor");
      if (film) mediums.push("film");
      if (digital) mediums.push("digital");
      if (!mediums.length) { toast.error("Pick at least one medium"); setRunning(false); return; }

      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape-adsoftheworld`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token ?? ""}`,
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ mediums, pages }),
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
      <h2 className="text-2xl font-black tracking-tighter mb-1 font-serif">✦ Ads of the World</h2>
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-6">
        Scrapes adsoftheworld.com listing pages by medium
      </p>

      <div className="border hairline p-6 space-y-6 bg-secondary/30">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Mediums</p>
          <div className="grid grid-cols-2 gap-2 max-w-xs">
            <label className="flex items-center gap-2 font-mono text-xs cursor-pointer">
              <input type="checkbox" checked={print} onChange={(e) => setPrint(e.target.checked)} /> Print
            </label>
            <label className="flex items-center gap-2 font-mono text-xs cursor-pointer">
              <input type="checkbox" checked={outdoor} onChange={(e) => setOutdoor(e.target.checked)} /> Outdoor
            </label>
            <label className="flex items-center gap-2 font-mono text-xs cursor-pointer">
              <input type="checkbox" checked={film} onChange={(e) => setFilm(e.target.checked)} /> Film
            </label>
            <label className="flex items-center gap-2 font-mono text-xs cursor-pointer">
              <input type="checkbox" checked={digital} onChange={(e) => setDigital(e.target.checked)} /> Digital
            </label>
          </div>
        </div>

        <div>
          <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Pages per medium: {pages}
          </Label>
          <input
            type="range"
            min={1}
            max={5}
            value={pages}
            onChange={(e) => setPages(parseInt(e.target.value))}
            className="mt-2 w-40 accent-foreground"
          />
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
            ~20–30 entries per page · max 5 pages
          </p>
        </div>

        <Button
          onClick={run}
          disabled={running}
          variant="outline"
          className="font-mono text-xs uppercase tracking-widest h-10 bg-background"
        >
          {running ? "Scraping…" : "Scrape Ads of the World"}
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
