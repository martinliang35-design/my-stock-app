"use client";

import { useEffect, useMemo, useState } from "react";
import type { Rates } from "@/lib/metrics";
import { supabase } from "@/lib/supabase";

export type SettingsModalProps = {
  open: boolean;
  onClose: () => void;
  rates: Rates;
  setRates: (r: Rates) => void;
  ratesUpdatedAt: number | null;
  setRatesUpdatedAt: (ts: number) => void;
};

export default function SettingsModal({
  open,
  onClose,
  rates,
  setRates,
  ratesUpdatedAt,
  setRatesUpdatedAt,
}: SettingsModalProps) {
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [draftRates, setDraftRates] = useState<Rates>(rates);
  const [savingRates, setSavingRates] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraftRates(rates);
    setProfileError(null);
    setLoadingProfile(true);
    (async () => {
      try {
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        const user = userData.user;
        if (!user) {
          setDisplayName("");
          setBio("");
          return;
        }
        const { data, error } = await supabase
          .from("profiles")
          .select("display_name,bio")
          .eq("user_id", user.id)
          .single();
        if (error) {
          // profiles 可能尚未创建：允许空值并在保存时 upsert
          setDisplayName("");
          setBio("");
          return;
        }
        setDisplayName(data?.display_name ?? "");
        setBio(data?.bio ?? "");
      } catch (e) {
        setProfileError(e instanceof Error ? e.message : "加载个人信息失败");
      } finally {
        setLoadingProfile(false);
      }
    })();
  }, [open, rates]);

  const headerTitle = useMemo(() => "设置", []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-2xl rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <h2 className="text-lg font-medium text-slate-200">{headerTitle}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <div className="p-4">
          <div className="mb-6">
            <h3 className="mb-2 text-sm font-semibold text-slate-200">个人信息</h3>
            {profileError && (
              <div className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {profileError}
              </div>
            )}

            {loadingProfile ? (
              <div className="text-sm text-slate-400">加载中…</div>
            ) : (
              <>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">昵称 / 显示名</span>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    placeholder="例如：我"
                  />
                </label>

                <label className="mt-3 block">
                  <span className="mb-1 block text-xs text-slate-400">简介 / 备注</span>
                  <textarea
                    rows={4}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="w-full resize-none rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    placeholder="例如：长期看好行业..."
                  />
                </label>

                <div className="mt-4 flex items-center justify-end">
                  <button
                    type="button"
                    disabled={savingProfile}
                    onClick={async () => {
                      setSavingProfile(true);
                      setProfileError(null);
                      try {
                        const { data: userData, error: userErr } = await supabase.auth.getUser();
                        if (userErr) throw userErr;
                        const user = userData.user;
                        if (!user) throw new Error("未登录");

                        const payload = {
                          user_id: user.id,
                          display_name: displayName,
                          bio: bio,
                        };

                        await supabase
                          .from("profiles")
                          .upsert(payload, { onConflict: "user_id" });
                      } catch (e) {
                        setProfileError(e instanceof Error ? e.message : "保存失败");
                      } finally {
                        setSavingProfile(false);
                      }
                    }}
                    className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-sky-400 disabled:opacity-50"
                  >
                    {savingProfile ? "保存中…" : "保存个人信息"}
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="mb-2">
            <h3 className="mb-2 text-sm font-semibold text-slate-200">汇率配置</h3>

            <div className="flex flex-wrap items-center gap-6">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                USD / CNY
                <input
                  type="number"
                  step={0.0001}
                  value={draftRates.usdToCny}
                  onChange={(e) =>
                    setDraftRates((r) => ({ ...r, usdToCny: Number(e.target.value) || 0 }))
                  }
                  className="w-20 rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                HKD / CNY
                <input
                  type="number"
                  step={0.0001}
                  value={draftRates.hkdToCny}
                  onChange={(e) =>
                    setDraftRates((r) => ({ ...r, hkdToCny: Number(e.target.value) || 0 }))
                  }
                  className="w-20 rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </label>
            </div>

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
              >
                关闭
              </button>
              <button
                type="button"
                disabled={savingRates}
                onClick={async () => {
                  setSavingRates(true);
                  try {
                    setRates(draftRates);
                    setRatesUpdatedAt(Date.now());
                  } finally {
                    setSavingRates(false);
                  }
                }}
                className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-sky-400 disabled:opacity-50"
              >
                {savingRates ? "保存中…" : "保存汇率"}
              </button>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              汇率更新于：{
                ratesUpdatedAt != null ? new Date(ratesUpdatedAt).toLocaleTimeString("zh-CN") : "--"
              }
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

