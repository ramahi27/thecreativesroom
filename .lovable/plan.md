## Why it's capped at 1000

The `/logs` page calls the `get_reference_logs()` RPC. PostgREST (the API layer in front of the database) caps every single response at **1000 rows by default**, regardless of how many rows the function actually returns. That's why log entry #1000 is the last one you see.

## Fix

Override the cap on the client call by chaining `.range(0, 49999)` onto each `supabase.rpc("get_reference_logs")` call in `src/pages/Logs.tsx` (3 places: lines 235, 423, 565). That lets the page receive up to 50,000 entries in one shot — comfortably above current and near-future volume, with no schema or RPC change needed.

No backend migration required.