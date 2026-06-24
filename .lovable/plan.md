## Fix duplicate `findCollection` export blocking the build

`src/lib/collections.ts` defines `findCollection` twice (lines 1372–1374 and 1376–1378), which fails the build with "Multiple exports with the same name". This is why the GitHub sync is showing a red banner — Lovable won't push a broken build.

### Change
- Delete the duplicate copy at lines 1376–1378 of `src/lib/collections.ts`.

### Verify
- Run `bun run build:dev` and confirm it succeeds.
- GitHub sync should then push cleanly on the next change.