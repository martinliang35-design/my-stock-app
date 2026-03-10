import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#020617] text-slate-200 px-4">
      <h1 className="text-2xl font-semibold text-slate-100 mb-2">页面未找到</h1>
      <p className="text-slate-400 mb-6">若您访问的是首页却看到此提示，多为开发服务器缓存异常，请按下方步骤操作。</p>
      <Link
        href="/"
        className="rounded-md bg-sky-500 px-4 py-2 text-slate-900 font-medium hover:bg-sky-400"
      >
        返回首页
      </Link>
      <p className="mt-8 text-sm text-slate-500">
        若仍 404：先结束占用 3000 端口的进程，删除 <code className="bg-slate-800 px-1 rounded">.next/dev</code> 和 <code className="bg-slate-800 px-1 rounded">.next/cache</code>，再执行 <code className="bg-slate-800 px-1 rounded">npm run dev</code>。
      </p>
    </div>
  );
}
