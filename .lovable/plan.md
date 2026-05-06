# Public taste portfolios

Every user gets a public page at `thecreativesroom.com/@username` showcasing their public collections and the references they contributed to the library. Folders default to public and can be toggled private; each folder gets a shareable link.

## What gets built

### 1. Database changes

**New `profiles` table** (one row per user, public-readable):
- `username` (unique, lowercase, 3–24 chars, `[a-z0-9_-]`)
- `display_name`, `bio` (≤200 chars), `avatar_url`

**Folders table**: add `is_public boolean default true`.

**RLS**:
- Profiles: anyone can read; only the owner can update; insert is the owner inserting their own row.
- Folders: existing owner-only policies stay; add a new `SELECT` policy "Anyone can view public folders" `USING (is_public = true)`.
- Folder items: add `SELECT` policy that allows reading items whose `folder_id` belongs to a public folder (via a security-definer helper to avoid recursion).

**Helpers (security definer)**:
- `get_profile_by_username(text)` returns profile + counts (public folder count, submitted/published ref count).
- `username_available(text)` for the signup form.

### 2. Signup + account

- **Signup form**: add a "Username" field above email. Validated client-side; checked for availability before submit. On success, inserts the profile row right after `signUp` / Google OAuth completes.
- **Google OAuth**: if the user has no profile after sign-in, redirect them to a small `/welcome` step asking them to choose a username.
- **Account page**: new "Public profile" section — edit username, display name, bio, avatar (upload to existing `references` storage bucket under `avatars/{user_id}/…`). Shows a "View your profile" link to `/@username`.

### 3. Folder visibility + sharing

In `FolderSidebar` and the folder card UI:
- Each folder gets a small "Public / Private" toggle.
- A "Share" icon next to the toggle copies `thecreativesroom.com/@username/c/folder-slug` to the clipboard. Disabled when private.

New folders default to **public**.

### 4. Public profile page `/@:username`

Layout:
```text
┌──────────────────────────────────────────────┐
│  [avatar]  display name                      │
│            @username                         │
│            short bio                         │
│                                              │
│  3 public folders · 18 references submitted  │
├──────────────────────────────────────────────┤
│  PUBLIC COLLECTIONS                          │
│  [folder card] [folder card] [folder card]   │
├──────────────────────────────────────────────┤
│  CONTRIBUTIONS                               │
│  [ref card] [ref card] [ref card] …          │
└──────────────────────────────────────────────┘
```

- Folder cards show the first 4 reference thumbnails as a mosaic + name + count. Click → `/@username/c/:folderId` (a public folder view that reuses the existing reference grid).
- Contributions = `references` where `created_by = profile.user_id AND published = true`, sorted by `approved_at desc`.
- 404 state when the username doesn't exist.
- SEO: title `@username — The Creatives Room`, meta description from bio, canonical URL.

### 5. Routing

- `/@:username` → `Profile` page
- `/@:username/c/:folderId` → `PublicFolder` page (reuses reference grid)
- `/welcome` → first-time username picker for OAuth signups

## Technical details

- Username regex: `^[a-z0-9_-]{3,24}$`. Reserved words blocked: `admin, account, auth, add, drafts, bookmarks, mycollection, settings, logs, users, ref, edit, privacy, terms, welcome, api`.
- `useProfile(username)` hook fetches via the security-definer RPC so anon visitors can load it.
- `FolderPickerButton` and `FolderSidebar` updated to show the visibility toggle inline.
- The share link uses the published origin (`https://thecreativesroom.com`) when on production, otherwise `window.location.origin`.
- `profiles` rows for existing users will be backfilled by a one-time migration that derives a candidate username from their email local-part (with numeric suffix on collision); they can change it from Account.

## Files added / changed

**Added**
- `src/pages/Profile.tsx`
- `src/pages/PublicFolder.tsx`
- `src/pages/Welcome.tsx`
- `src/hooks/useProfile.ts`
- `src/lib/username.ts` (validation + reserved list)
- `src/components/FolderVisibilityToggle.tsx`

**Edited**
- `src/App.tsx` (new routes)
- `src/pages/Auth.tsx` (username field + post-signup profile insert)
- `src/pages/Account.tsx` (public profile section)
- `src/components/FolderSidebar.tsx`, `src/components/FolderGridCard.tsx` (visibility + share)
- `src/hooks/useFolders.ts` (`is_public` field + setter)

## Out of scope (ask later if you want it)
- Following users, activity feed, comments
- Saved-count badge (you didn't pick that option)
- Custom profile theming
