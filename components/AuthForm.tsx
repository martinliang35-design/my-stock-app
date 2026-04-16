"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type Mode = "login" | "signup" | "forgot";

function getResetRedirectTo(): string | null {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/$/, "");
  if (siteUrl) return `${siteUrl}/reset-password`;
  if (typeof window !== "undefined") return `${window.location.origin}/reset-password`;
  return null;
}

function getAuthErrorMessage(error: Error, mode: Mode): string {
  const msg = error.message.toLowerCase();
  if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials")) {
    return "邮箱或密码错误，请检查后重试。";
  }
  if (msg.includes("user already registered") || msg.includes("already registered")) {
    return "该邮箱已注册，请直接登录。";
  }
  if (msg.includes("password should be at least") || msg.includes("password")) {
    return "密码至少需要 6 位字符。";
  }
  if (msg.includes("invalid email") || msg.includes("invalid email format")) {
    return "请输入有效的邮箱地址。";
  }
  if (msg.includes("too many requests") || msg.includes("rate limit")) {
    return "请求过于频繁，请等待约 1～5 分钟后再试。";
  }
  if (msg.includes("timeout") || msg.includes("超时")) {
    return "请求超时，请检查网络后重试。";
  }
  if (mode === "forgot") return "发送重置邮件失败，请稍后重试。";
  if (mode === "login") return "登录失败，请检查邮箱和密码后重试。";
  return "操作失败，请重试。";
}

type Props = { hint?: string; onAuthSuccess?: () => void };

export default function AuthForm({ hint, onAuthSuccess }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    const timeoutMs = 25000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), timeoutMs)
    );
    try {
      if (mode === "signup") {
        const { data, error } = await Promise.race([
          supabase.auth.signUp({ 
            email, 
            password,
            options: {
              emailRedirectTo: undefined,
            },
          }),
          timeoutPromise,
        ]);
        if (error) throw error;
        const isAlreadyRegistered =
          data?.user && (!data.user.identities || data.user.identities.length === 0);
        if (isAlreadyRegistered) {
          setMessage({
            type: "error",
            text: "该邮箱已注册，请直接登录。您的数据不会被覆盖。",
          });
          setMode("login");
          return;
        }
        setMessage({ type: "success", text: "注册成功，请查收邮件确认（若已开启确认），或直接登录。" });
        onAuthSuccess?.();
      } else if (mode === "login") {
        const { error } = await Promise.race([
          supabase.auth.signInWithPassword({ email, password }),
          timeoutPromise,
        ]);
        if (error) throw error;
        setMessage({ type: "success", text: "登录成功" });
        onAuthSuccess?.();
      } else {
        const redirectTo = getResetRedirectTo();
        if (!redirectTo) {
          throw new Error("missing reset redirect url");
        }
        const { error } = await Promise.race([
          supabase.auth.resetPasswordForEmail(email, { redirectTo }),
          timeoutPromise,
        ]);
        if (error) throw error;
        setMessage({
          type: "success",
          text: "如果该邮箱已注册，我们已发送重置邮件，请前往邮箱查看。",
        });
      }
    } catch (err) {
      const text = err instanceof Error ? getAuthErrorMessage(err, mode) : "操作失败，请重试。";
      setMessage({ type: "error", text });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-700 bg-slate-900/50 p-6 shadow-xl">
        <h1 className="text-xl font-semibold text-foreground mb-1">Stock-Cloud</h1>
        <p className="text-sm text-slate-400 mb-6">登录或注册以管理您的持仓</p>
        {hint && (
          <p className="text-sm text-amber-400 mb-4 rounded-md bg-amber-500/10 px-3 py-2">{hint}</p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1">邮箱</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-foreground placeholder-slate-500 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="you@example.com"
            />
          </div>
          {mode !== "forgot" && (
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1">密码</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={6}
                className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-foreground placeholder-slate-500 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="至少 6 位"
              />
            </div>
          )}
          {message && (
            <p className={`text-sm ${message.type === "success" ? "text-green-400" : "text-red-400"}`}>
              {message.text}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 font-medium text-slate-900 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "处理中…" : mode === "login" ? "登录" : mode === "signup" ? "注册" : "发送重置邮件"}
          </button>
        </form>
        {mode === "login" && (
          <button
            type="button"
            onClick={() => {
              setMode("forgot");
              setMessage(null);
            }}
            className="mt-3 w-full text-sm text-slate-400 hover:text-foreground"
          >
            忘记密码？
          </button>
        )}
        {mode === "forgot" && (
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setMessage(null);
            }}
            className="mt-3 w-full text-sm text-slate-400 hover:text-foreground"
          >
            返回登录
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signup" ? "login" : "signup");
            setMessage(null);
          }}
          className="mt-4 w-full text-sm text-slate-400 hover:text-foreground"
        >
          {mode === "signup" ? "已有账号？去登录" : "没有账号？去注册"}
        </button>
      </div>
    </div>
  );
}
