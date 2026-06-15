import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const FEEDS = [
  { label: "It's Nice That",   url: "https://www.itsnicethat.com/feed",         source: "itsnicethat" },
  { label: "Dezeen",           url: "https://www.dezeen.com/feed/",              source: "dezeen" },
  { label: "The Dieline",      url: "https://thedieline.com/feed",               source: "thedieline" },
  { label: "Ads of the World", url: "https://www.adsoftheworld.com/feed/",       source: "adsoftheworld" },
  { label: "Creative Boom",    url: "https://www.creativeboom.com/feed/",        source: "creativeboom" },
] as const;

type LogLine = { kind: "progress" | "warn" | "done" | "error"; text: string };

export function RssScraper() {
  const [feedUrl, setFeedUrl] = useState("");
  const [source, setSource]   = useState("");
  const [limit, setLimit]     = useState(50);
  const [running, setRunning] = useState(false);
  const [log, setLog]         = useState<LogLine[]>([]);

  function selectPreset(feed: typeof FEEDS[number]) {
    setFeedUrl(feed.url);
    setSource(feed.source);
  }

  async function run() {
    const url = feedUrl.trim();
    if (!url) { toast.error("Enter a feed URL"); return; }
    setRunning(true);
    setLog([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape-rss`;
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ feedUrl: url, source: source || "rss", limit }),
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
              setLog((l) => [...l, { kind: "done", text: `✓ Done — ${ev.inserted} inserted, ${ev.skipped} skipped (${ev.total} total)` }]);
              toast.success(`Imported ${ev.inserted} references from RSS`);
            } else if (ev.type === "error") {
              setLog((l) => [...l, { kind: "error", text: `✕ ${ev.message}` }]);
              toast.error(ev.message);
            }
          } catch { /* ignore malformed */ }
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
        <h3 className="font-mono text-xs uppercase tracking-widest">✦ RSS feed import</h3>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Import from any RSS/Atom feed — select a preset or paste a custom URL
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FEEDS.map((f) => (
          <button
            key={f.source}
            type="button"
            onClick={() => selectPreset(f)}
            disabled={running}
            className={`font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 border hairline transition-colors ${
              feedUrl === f.url ? "bg-foreground text-background" : "hover:bg-muted"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <Input
          type="url"
          placeholder="https://example.com/feed"
          value={feedUrl}
          onChange={(e) => setFeedUrl(e.target.value)}
          disabled={running}
          className="bg-secondary border-0 font-mono"
        />
        <div className="flex items-center gap-4">
          <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground whitespace-nowrap">
            Limit: {limit}
          </label>
          <input
            type="range"
            min={10}
            max={200}
            step={10}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            disabled={running}
            className="flex-1"
          />
          <Button
            onClick={run}
            disabled={running}
            className="font-mono text-xs uppercase tracking-widest shrink-0"
          >
            {running ? "Importing…" : "Import feed"}
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
