import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type LogLine = { kind: "progress" | "warn" | "done" | "error"; text: string };

export function PinterestBoardImporter() {
  const [boardUrl, setBoardUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);

  async function run() {
    const url = boardUrl.trim();
    if (!url) {
      toast.error("Paste a Pinterest board URL");
      return;
    }
    setRunning(true);
    setLog([]);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-pinterest-board`;
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ boardUrl: url }),
      });
      if (!resp.ok || !resp.body) {
        const t = await resp.text().catch(() => "");
        setLog((l) => [
          ...l,
          { kind: "error", text: `✕ Import failed (${resp.status}) ${t}` },
        ]);
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
              setLog((l) => [
                ...l,
                {
                  kind: "done",
                  text:
                    `✓ Complete — ${s.projects} projects added · ` +
                    `${s.auto_grouped_by_url} grouped by URL · ` +
                    `${s.grouped_by_title} grouped by title · ` +
                    `${s.grouped_by_ai} grouped by AI · ` +
                    `${s.single_pins} single pins`,
                },
              ]);
              toast.success(`Imported ${s.projects} projects from Pinterest`);
            } else if (ev.type === "error") {
              setLog((l) => [
                ...l,
                { kind: "error", text: `✕ ${ev.message}` },
              ]);
              toast.error(ev.message);
            }
          } catch {
            // ignore malformed line
          }
        }
      }
    } catch (e: any) {
      setLog((l) => [
        ...l,
        { kind: "error", text: `✕ ${e?.message || String(e)}` },
      ]);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-mono text-xs uppercase tracking-widest">
          ✦ Pinterest board import
        </h3>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Add a Pinterest board URL — we'll fetch all pins and group related
          photos into single projects
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          type="url"
          placeholder="https://pinterest.com/username/board-name"
          value={boardUrl}
          onChange={(e) => setBoardUrl(e.target.value)}
          disabled={running}
          className="bg-secondary border-0 font-mono"
        />
        <Button
          onClick={run}
          disabled={running}
          className="font-mono text-xs uppercase tracking-widest"
        >
          {running ? "Importing…" : "Import board"}
        </Button>
      </div>

      {log.length > 0 && (
        <div className="mt-2 border hairline bg-muted/40 p-3 max-h-72 overflow-auto font-mono text-[11px] leading-relaxed">
          {log.map((l, i) => (
            <div
              key={i}
              className={
                l.kind === "error"
                  ? "text-destructive"
                  : l.kind === "warn"
                    ? "text-amber-600 dark:text-amber-400"
                    : l.kind === "done"
                      ? "text-primary"
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
