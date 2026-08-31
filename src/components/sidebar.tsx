"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar({
  count,
  children,
}: {
  count?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="w-[320px] flex flex-col border-r border-white/[0.06]" style={{ background: "#141414" }}>
      {/* Sidebar Header */}
      <div className="px-5 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white leading-tight">WhatsApp AI Agent</h1>
            <p className="text-xs text-white/40 leading-tight mt-0.5">
              {typeof count === "number" ? `${count} conversation${count !== 1 ? "s" : ""}` : "Dashboard"}
            </p>
          </div>
        </div>
      </div>

      {/* Nav Tabs */}
      <div className="flex px-3 py-2 gap-1 border-b border-white/[0.06]">
        <Link
          href="/"
          className={`flex-1 text-center text-xs font-medium px-3 py-2 rounded-lg transition-colors ${
            pathname === "/"
              ? "bg-emerald-500/15 text-emerald-400"
              : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
          }`}
        >
          Chats
        </Link>
        <Link
          href="/dashboard"
          className={`flex-1 text-center text-xs font-medium px-3 py-2 rounded-lg transition-colors ${
            pathname === "/dashboard"
              ? "bg-emerald-500/15 text-emerald-400"
              : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
          }`}
        >
          Monitoring
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}