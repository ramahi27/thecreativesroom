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
const NAV_KEY = "modalNavOrder";

type Entry = { url: string; scroll: number };

// Persist the ordered list of reference IDs visible on the page that opened
// the modal. The modal uses this for prev/next so navigation always follows
// the user's original browsing context (filtered grid, folder, bookmarks…).
export function setModalNavOrder(ids: string[]) {
  try {
    sessionStorage.setItem(NAV_KEY, JSON.stringify(ids.filter(Boolean)));
  } catch {
    /* noop */
  }
}

export function getModalNavOrder(): string[] {
  try {
    const raw = sessionStorage.getItem(NAV_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export function clearModalNavOrder() {
  try {
    sessionStorage.removeItem(NAV_KEY);
  } catch {
    /* noop */
  }
}

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
  // Restore scroll once the destination has rendered enough content to
  // actually reach that offset. Poll briefly because the page may re-fetch
  // data after navigation, growing the document height asynchronously.
  const start = performance.now();
  const tryScroll = () => {
    const maxY = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight,
    );
    const target = Math.min(scroll, maxY);
    window.scrollTo({ top: target, left: 0, behavior: "auto" });
    if (target < scroll && performance.now() - start < 1500) {
      requestAnimationFrame(tryScroll);
    }
  };
  requestAnimationFrame(() => requestAnimationFrame(tryScroll));
}
