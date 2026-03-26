export default function DebugPage() {
  return (
    <div className="p-8">
      <h1>🔧 开发环境健康检查</h1>
      <ul>
        <li>✅ Next.js 版本：{process.env.NEXT_VERSION || "unknown"}</li>
        <li>✅ Supabase URL: {process.env.NEXT_PUBLIC_SUPABASE_URL ? "配置了" : "❌ 未配置"}</li>
        <li>✅ 端口：3000</li>
        <li>✅ 时间：{new Date().toLocaleString()}</li>
      </ul>
      <p>如果能看到这个页面，说明 Next.js 正常运行。</p>
    </div>
  );
}
