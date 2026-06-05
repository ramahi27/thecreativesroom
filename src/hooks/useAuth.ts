import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

// Module-level singleton state — shared across ALL useAuth() consumers.
// This prevents every page/component from re-running getSession() and the
// admin check on mount, which was causing slow navigation between pages.

type AuthState = { user: User | null; isAdmin: boolean; loading: boolean };

let cached: AuthState = { user: null, isAdmin: false, loading: true };
const listeners = new Set<(s: AuthState) => void>();
let initialized = false;

function setState(next: Partial<AuthState>) {
  cached = { ...cached, ...next };
  listeners.forEach((l) => l(cached));
}

async function checkAdmin(userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  setState({ isAdmin: !!data });
}

function init() {
  if (initialized) return;
  initialized = true;

  supabase.auth.onAuthStateChange((_event, session) => {
    const user = session?.user ?? null;
    // Always reset isAdmin to false before the async check so a previously
    // cached true value is never inherited by a different (or re-authed) user.
    setState({ user, isAdmin: false });
    if (user) {
      // Defer to avoid deadlock inside the auth callback
      setTimeout(() => checkAdmin(user.id), 0);
    }
  });

  supabase.auth.getSession().then(async ({ data: { session } }) => {
    const user = session?.user ?? null;
    // Don't set loading:false until after checkAdmin resolves —
    // otherwise components briefly see isAdmin:false for real admins
    // and redirect them away before the check completes.
    setState({ user });
    if (user) await checkAdmin(user.id);
    setState({ loading: false });
  });
}

export function useAuth() {
  init();
  const [state, setLocal] = useState<AuthState>(cached);

  useEffect(() => {
    // Sync in case state changed between render and effect
    setLocal(cached);
    listeners.add(setLocal);
    return () => {
      listeners.delete(setLocal);
    };
  }, []);

  return state;
}
