## Goal

Stop generating visual metadata from the model's training knowledge alone. For every reference we backfill or refresh, **scrape real evidence from the web first** — the project's source URL, plus a targeted web search for the campaign — then have the AI write `visual_summary` and `editing_style` grounded in that evidence. This is what's missing today: `generate-metadata` never opens a browser, so the model invents plausible-but-generic descriptions ("lively pace, quick cuts, vibrant palette") that all blur together and make brief matching weak.

## How it will work

New edge function `enrich-visual` (admin-only, NDJSON streamed progress, same shape as `audit-recent`):

For each reference it processes:

1. **Scrape the source URL** with Firecrawl (`formats: ['summary', 'markdown']`, `onlyMainContent: true`). Captures the page title, meta description, scraped body, and Firecrawl's AI summary.
2. **Run a targeted web search** via Firecrawl `/search` with a query built from `title + brand + year + "campaign editing style"` (limit 5, no scrape). Captures press / award / case-study snippets that often describe pacing, transitions, palette and director.
3. **Send all of that** as `evidence:` context to gemini-2.5-pro through the existing AI gateway. The prompt requires:
   - Cite **concrete observed details** (named directors / DPs / editors when found, specific colour names, specific shot/edit devices like "whip pans", "L-cuts", "single take", "split screen") rather than generic adjectives.
   - **Forbid filler words** ("lively", "vibrant", "dynamic", "engaging", "bright and clean") — the model must rewrite or omit.
   - If evidence is thin, return `null` for that field instead of guessing — better to leave blank than pollute.
   - `editing_style` only for `type='video'`; `visual_summary` for both.
4. **Update the row** with whatever non-null fields came back, plus a new `visual_enriched_at` timestamp so we can re-run only what hasn't been processed.

### Schema change

Add one column to `references`:
- `visual_enriched_at timestamptz null` — lets the function paginate ("WHERE visual_enriched_at IS NULL OR < cutoff") and lets us track coverage.

### Logs page UI

In `src/pages/Logs.tsx`, add a new button next to the existing audit controls:

- **"Enrich visual metadata"** — runs `enrich-visual` in batch mode, streams progress (same UX as `audit-recent`).
- Optional **"force re-enrich"** toggle to reprocess already-enriched rows when we tune the prompt.
- Single-row mode triggered from the existing row actions to test on one reference.

### Where the brief matcher benefits

No change needed in `match-brief` — it already reads `visual_summary` / `editing_style` as the primary signals. Once the enriched values are specific instead of generic, briefs like "quick cuts" will rank refs that **actually** use quick cuts above refs whose description just happened to contain that phrase.

## Out of scope

- No structured/categorical tag fields (we discussed earlier; deferred — let's see how much pure-prose accuracy improves first).
- No automatic re-enrichment cron — manual button only.
- No change to the front-end brief page itself.

## Technical details

- **Firecrawl**: already connected (`FIRECRAWL_API_KEY` used by `audit-recent`).
- **AI model**: `google/gemini-2.5-pro` (same as `audit-recent`), tool-calling to enforce the output shape.
- **Concurrency**: 5 per batch (matches `audit-recent`).
- **Cost guardrail**: per-invocation `limit` capped at 100 refs (default 50), client paginates via `offset` until `hasMore=false`.
- **Failure handling**: if Firecrawl returns nothing AND search returns nothing, skip the row (leave fields untouched, still stamp `visual_enriched_at` so we don't retry forever — admin can clear it manually to retry).
- **Estimated cost**: ~922 refs × (1 scrape + 1 search + 1 pro call) ≈ a few dollars of Firecrawl credits + AI credits for a full backfill. Incremental on new uploads is negligible.

```text
[Logs page]
   │ click "Enrich visual metadata"
   ▼
[enrich-visual edge fn]  ── Firecrawl scrape(source_url) ─┐
   │                     ── Firecrawl search(title+brand)┤
   │                                                     ▼
   │                     ── gemini-2.5-pro (evidence as context)
   ▼
[references row: visual_summary, editing_style, visual_enriched_at]
```
