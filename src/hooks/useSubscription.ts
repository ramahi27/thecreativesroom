import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Plan = "free" | "paid";
interface SubState { plan: Plan; isPro: boolean; loading: boolean }

let _cache: { uid: string; plan: Plan } | null = null;
const _listeners = new Set<(s: SubState) => void>();

function broadcast(s: SubState) {
  _listeners.forEach((l) => l(s));
}

export function invalidateSubscription() {
  _cache = null;
}

export function useSubscription() {
  const { user, loading: authLoading } = useAuth();

  const [state, setState] = useState<SubState>(() => {
    if (_cache && user?.id === _cache.uid) {
      return { plan: _cache.plan, isPro: _cache.plan === "paid", loading: false };
    }
    return { plan: "free", isPro: false, loading: true };
  });

  useEffect(() => {
    _listeners.add(setState);
    return () => { _listeners.delete(setState); };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setState({ plan: "free", isPro: false, loading: false });
      return;
    }
    if (_cache?.uid === user.id) {
      const s = { plan: _cache.plan, isPro: _cache.plan === "paid", loading: false };
      setState(s);
      return;
    }
    supabase
      .rpc("get_my_plan" as any)
      .then(({ data }) => {
        const plan = (data as Plan) || "free";
        _cache = { uid: user.id, plan };
        const s = { plan, isPro: plan === "paid", loading: false };
        setState(s);
        broadcast(s);
      });
  }, [user?.id, authLoading]);

  return state;
}
