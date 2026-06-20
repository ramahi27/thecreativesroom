I’ll fix the scrape/import issue by making the edge function return clear, handled errors instead of failing as a generic 500.

Plan:
1. Inspect the current `scrape-link` function and the admin/import UI call path.
2. Harden the likely failure points:
   - YouTube/oEmbed metadata fetches
   - AI metadata inference fallback
   - database insert/update errors
   - response handling/CORS for all error paths
3. Keep the import usable even if optional metadata extraction fails, so a valid URL can still be saved with basic title/source data.
4. Add focused logging that identifies the failing stage without exposing secrets or sensitive user data.
5. Verify the flow by invoking the function with a representative YouTube URL and checking the returned status/body.