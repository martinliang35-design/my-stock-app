"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type ExchangeStatus = "checking" | "ready" | "invalid";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [exchangeStatus, setExchangeStatus] = useState<ExchangeStatus>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams(window.location.search);
    const codeParam = query.get("code");

    async function exchange() {
      if (codeParam) {
        const { error } = await supabase.auth.exchangeCodeForSession(codeParam);
        if (!active) return;
        if (error) {
          setExchangeStatus("invalid");
          setMessage({ type: "error", text: "重置链接已过期或无效，请重新发起忘记密码。" });
          return;
        }
        setExchangeStatus("ready");
        setMessage(null);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (data.session) {
        // Supabase 可能通过 URL hash 自动恢复会话，此时无需 code 也可直接改密。
        setExchangeStatus("ready");
        setMessage(null);
        return;
      }

      setExchangeStatus("invalid");
      setMessage({ type: "error", text: "重置链接无效，请返回登录页重新发起忘记密码。" });
    }

    exchange();
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (password.length < 6) {
      setMessage({ type: "error", text: "新密码至少需要 6 位字符。" });
      return;
    }
    if (password !== confirmPassword) {
      setMessage({ type: "error", text: "两次输入的密码不一致，请检查后重试。" });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await supabase.auth.signOut();
      setMessage({ type: "success", text: "密码已更新，请使用新密码重新登录。" });
      setPassword("");
      setConfirmPassword("");
    } catch {
      setMessage({ type: "error", text: "密码重置失败，请重新发起忘记密码后再试。" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-700 bg-slate-900/50 p-6 shadow-xl">
        <h1 className="text-xl font-semibold text-foreground mb-1">重置密码</h1>
        <p className="text-sm text-slate-400 mb-6">请设置一个新的登录密码</p>

        {exchangeStatus === "checking" && (
          <p className="text-sm text-slate-400">正在校验重置链接，请稍候…</p>
        )}

        {exchangeStatus !== "checking" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1">
                新密码
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                disabled={exchangeStatus !== "ready" || loading}
                className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-foreground placeholder-slate-500 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                placeholder="至少 6 位"
              />
            </div>
            <div>
              <label
                htmlFor="confirm-password"
                className="block text-sm font-medium text-slate-300 mb-1"
              >
                确认新密码
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                disabled={exchangeStatus !== "ready" || loading}
                className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-foreground placeholder-slate-500 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                placeholder="再次输入新密码"
              />
            </div>
            {message && (
              <p className={`text-sm ${message.type === "success" ? "text-green-400" : "text-red-400"}`}>
                {message.text}
              </p>
            )}
            <button
              type="submit"
              disabled={exchangeStatus !== "ready" || loading}
              className="w-full rounded-md bg-primary px-4 py-2 font-medium text-slate-900 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "处理中…" : "更新密码"}
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={() => router.push("/")}
          className="mt-4 w-full text-sm text-slate-400 hover:text-foreground"
        >
          返回登录
        </button>
      </div>
    </div>
  );
}
