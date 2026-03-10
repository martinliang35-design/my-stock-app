"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import AuthForm from "@/components/AuthForm";
import HoldingsDashboard from "@/components/HoldingsDashboard";

type SessionResult = { data: { session: Session | null }; timedOut?: boolean };

export default function AuthGuard() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadTimedOut, setLoadTimedOut] = useState(false);

  useEffect(() => {
    const timeoutMs = 10000;
    const timeoutPromise = new Promise<SessionResult>((resolve) =>
      setTimeout(() => resolve({ data: { session: null }, timedOut: true }), timeoutMs)
    );
    Promise.race([
      supabase.auth.getSession().then((r) => ({ ...r, timedOut: false })),
      timeoutPromise,
    ]).then((result: SessionResult) => {
      setSession(result.data.session);
      setLoadTimedOut(result.timedOut === true);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <span className="text-slate-400">加载中…</span>
      </div>
    );
  }

  if (!session) {
    return (
      <AuthForm
        hint={loadTimedOut ? "首次加载超时，请检查网络后重试登录。" : undefined}
        onAuthSuccess={() => {
          supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s));
        }}
      />
    );
  }

  return <HoldingsDashboard />;
}
