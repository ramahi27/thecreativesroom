# /ref/* OG Prerender Worker

This Worker fixes WhatsApp/Telegram/etc. link previews for `/ref/*` URLs.
The Netlify edge function (`netlify/edge-functions/prerender.ts`) is dead
code — the site is served from Cloudflare, not Netlify, so the edge
function never runs.

## Deploy

1. Cloudflare dashboard → Workers & Pages → Create → "Hello World" template.
2. Paste the contents of `prerender.js`. Deploy.
3. Workers & Pages → your worker → **Settings → Triggers → Routes** → Add:
   - `thecreativesroom.com/ref/*`
   - `www.thecreativesroom.com/ref/*` (if you use www)
4. Done. No secrets needed — uses the public Supabase anon key.

## Test (after deploy)

```bash
# As WhatsApp — should return HTML with og:image = reference thumbnail
curl -sA "WhatsApp/2.0" \
  https://thecreativesroom.com/ref/7cf8dc69-8dd0-4fa2-8ae1-654801164d95-care-service \
  | grep -E 'og:(title|image|description)'

# As a real user — should return the SPA (index.html)
curl -sA "Mozilla/5.0" \
  https://thecreativesroom.com/ref/7cf8dc69-8dd0-4fa2-8ae1-654801164d95-care-service \
  | head -20
```

Then re-share the link in WhatsApp — first time it may still show cached
preview; force a refresh by appending `?v=1` to the URL.
