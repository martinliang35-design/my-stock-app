"use client";

import { useEffect, useState } from "react";

export type StrategyModalProps = {
  open: boolean;
  title: string;
  initialText: string;
  onClose: () => void;
  onSave: (text: string) => Promise<void> | void;
};

export default function StrategyModal({
  open,
  title,
  initialText,
  onClose,
  onSave,
}: StrategyModalProps) {
  const [text, setText] = useState(initialText ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setText(initialText ?? "");
    setError(null);
    setSaving(false);
  }, [open, initialText]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-2xl rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <h2 className="text-lg font-medium text-slate-200">{title}</h2>
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
          {error && (
            <div className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder="输入你的投资策略/备注..."
            className="w-full resize-none rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={async () => {
                setSaving(true);
                setError(null);
                try {
                  await onSave(text);
                  onClose();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "保存失败，请重试。");
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
              className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-sky-400 disabled:opacity-50"
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

