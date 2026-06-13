import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type LogLine = { kind: "progress" | "warn" | "done" | "error"; text: string };

// Shared NDJSON streaming runner — POSTs to an edge function and renders progress.
function useImporter(fnName: string) {
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);

  async function run(body: unknown) {
    setRunning(true);
    setLog([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fnName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token ?? ""}`,
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok || !resp.body) {
        const t = await resp.text().catch(() => "");
        setLog((l) => [...l, { kind: "error", text: `✕ Import failed (${resp.status}) ${t}` }]);
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
            if (ev.type === "progress") setLog((l) => [...l, { kind: "progress", text: `● ${ev.message}` }]);
            else if (ev.type === "warn") setLog((l) => [...l, { kind: "warn", text: `⚠ ${ev.message}` }]);
            else if (ev.type === "done") {
              const s = ev.summary;
              setLog((l) => [...l, { kind: "done", text: `✓ Complete — ${s.total_fetched} fetched · ${s.saved} saved · ${s.skipped_duplicates} duplicates · ${s.errors} errors` }]);
            } else if (ev.type === "error") setLog((l) => [...l, { kind: "error", text: `✕ ${ev.message}` }]);
          } catch { /* ignore partial */ }
        }
      }
    } catch (e: any) {
      setLog((l) => [...l, { kind: "error", text: `✕ Import failed — ${e.message ?? "unknown"}` }]);
    } finally {
      setRunning(false);
    }
  }

  return { running, log, run };
}

function LogPanel({ log }: { log: LogLine[] }) {
  if (log.length === 0) return null;
  return (
    <div className="border-t hairline pt-4 space-y-1 max-h-72 overflow-y-auto font-mono text-[11px]">
      {log.map((l, i) => (
        <p
          key={i}
          className={
            l.kind === "done" ? "text-primary" :
            l.kind === "error" ? "text-destructive" :
            l.kind === "warn" ? "text-muted-foreground" : ""
          }
        >
          {l.text}
        </p>
      ))}
    </div>
  );
}

// ── Pexels & Unsplash share the same query-based UI ──────────────────────────
function PhotoApiImporter({
  fnName, title, subtitle, placeholder, defaultCount, maxCount,
}: {
  fnName: string; title: string; subtitle: string; placeholder: string;
  defaultCount: number; maxCount: number;
}) {
  const { running, log, run } = useImporter(fnName);
  const [terms, setTerms] = useState("");
  const [perQuery, setPerQuery] = useState(defaultCount);
  const [orientation, setOrientation] = useState("");

  function start() {
    const queries = terms.split(",").map((t) => t.trim()).filter(Boolean);
    if (!queries.length) { toast.error("Enter at least one search term"); return; }
    run({ queries, perQuery, orientation: orientation || undefined });
  }

  return (
    <section>
      <h2 className="text-2xl font-black tracking-tighter mb-1 font-serif">✦ {title}</h2>
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-6">{subtitle}</p>

      <div className="border hairline p-6 space-y-6 bg-secondary/30">
        <div>
          <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Search terms (comma-separated)
          </Label>
          <Input
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            placeholder={placeholder}
            className="mt-2 bg-background border hairline font-mono text-xs"
            disabled={running}
          />
        </div>

        <div className="flex flex-wrap gap-8">
          <div>
            <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Per term: {perQuery}
            </Label>
            <input
              type="range" min={10} max={maxCount} step={10} value={perQuery}
              onChange={(e) => setPerQuery(parseInt(e.target.value))}
              className="mt-2 w-40 accent-foreground block" disabled={running}
            />
          </div>
          <div>
            <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Orientation
            </Label>
            <select
              value={orientation}
              onChange={(e) => setOrientation(e.target.value)}
              className="mt-2 block bg-background border hairline font-mono text-xs px-2 py-1.5"
              disabled={running}
            >
              <option value="">Any</option>
              <option value="landscape">Landscape</option>
              <option value="portrait">Portrait</option>
              <option value={fnName === "import-unsplash" ? "squarish" : "square"}>Square</option>
            </select>
          </div>
        </div>

        <Button
          onClick={start} disabled={running} variant="outline"
          className="font-mono text-xs uppercase tracking-widest h-10 bg-background"
        >
          {running ? "Importing…" : `Import from ${title}`}
        </Button>

        <LogPanel log={log} />
      </div>
    </section>
  );
}

export function PexelsImporter() {
  return (
    <PhotoApiImporter
      fnName="import-pexels"
      title="Pexels"
      subtitle="Bulk-imports photos via the Pexels API · needs PEXELS_API_KEY secret"
      placeholder="minimalist poster, brutalist architecture, neon signage"
      defaultCount={40}
      maxCount={80}
    />
  );
}

export function UnsplashImporter() {
  return (
    <PhotoApiImporter
      fnName="import-unsplash"
      title="Unsplash"
      subtitle="Bulk-imports photos via the Unsplash API · needs UNSPLASH_ACCESS_KEY secret"
      placeholder="editorial portrait, abstract texture, urban photography"
      defaultCount={30}
      maxCount={90}
    />
  );
}

// ── Are.na: channel-based ─────────────────────────────────────────────────────
export function ArenaImporter() {
  const { running, log, run } = useImporter("import-arena");
  const [channels, setChannels] = useState("");
  const [perChannel, setPerChannel] = useState(100);

  function start() {
    const list = channels.split(",").map((t) => t.trim()).filter(Boolean);
    if (!list.length) { toast.error("Enter at least one channel slug or URL"); return; }
    run({ channels: list, perChannel });
  }

  return (
    <section>
      <h2 className="text-2xl font-black tracking-tighter mb-1 font-serif">✦ Are.na</h2>
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-6">
        Pulls image blocks from public Are.na channels · no key needed
      </p>

      <div className="border hairline p-6 space-y-6 bg-secondary/30">
        <div>
          <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Channel slugs or URLs (comma-separated)
          </Label>
          <Input
            value={channels}
            onChange={(e) => setChannels(e.target.value)}
            placeholder="graphic-design-inspiration, are.na/user/typography-channel"
            className="mt-2 bg-background border hairline font-mono text-xs"
            disabled={running}
          />
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-2">
            Find channels at are.na — paste the slug (last part of the URL) or the full link
          </p>
        </div>

        <div>
          <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Max blocks per channel: {perChannel}
          </Label>
          <input
            type="range" min={20} max={400} step={20} value={perChannel}
            onChange={(e) => setPerChannel(parseInt(e.target.value))}
            className="mt-2 w-40 accent-foreground block" disabled={running}
          />
        </div>

        <Button
          onClick={start} disabled={running} variant="outline"
          className="font-mono text-xs uppercase tracking-widest h-10 bg-background"
        >
          {running ? "Importing…" : "Import from Are.na"}
        </Button>

        <LogPanel log={log} />
      </div>
    </section>
  );
}
