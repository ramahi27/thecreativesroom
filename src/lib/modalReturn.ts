// Tracks the page (URL + scroll position) the user was on when they opened
// a modal/popup such as the reference detail view. On close, approve, reject,
// or delete from inside the modal, callers can return the user exactly where
// they were.
//
// Behaviour:
// - rememberModalReturn() should be called from the trigger that opens the
//   modal (e.g. card click, list-item button). It stores the current pathname,
//   search, hash, and scrollY in sessionStorage.
// - It deliberately does NOT overwrite an existing entry, so that navigating
//   prev/next within the modal still returns the user to their original page.
// - consumeModalReturn() pops the stored entry, navigates to it via the
//   provided navigate() function, and restores scroll position once the
//   destination page has rendered.
// - If nothing is stored (e.g. user landed on /ref/:id directly), callers
//   fall back to a sensible default.

import type { NavigateFunction } from "react-router-dom";

const KEY = "modalReturn";

type Entry = { url: string; scroll: number };

export function rememberModalReturn() {
  try {
    if (sessionStorage.getItem(KEY)) return; // don't clobber while modal is open
    const entry: Entry = {
      url: window.location.pathname + window.location.search + window.location.hash,
      scroll: window.scrollY || 0,
    };
    sessionStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    /* noop */
  }
}

export function peekModalReturn(): Entry | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Entry;
  } catch {
    return null;
  }
}

export function clearModalReturn() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}

export function consumeModalReturn(navigate: NavigateFunction, fallback = "/") {
  const entry = peekModalReturn();
  clearModalReturn();
  const target = entry?.url || fallback;
  const scroll = entry?.scroll ?? 0;
  navigate(target);
  // Restore scroll after the destination route has rendered.
  // Two rAFs handles both initial paint and any layout shift.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: scroll, left: 0, behavior: "auto" });
    });
  });
}
