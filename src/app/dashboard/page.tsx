"use client";

import { useEffect, useState, useMemo } from "react";
import Sidebar from "@/components/sidebar";

type Stats = {
  totalExternal: number;
  avgResponseSeconds: number;
  categoryBreakdown: Record<string, number>;
};

const CATEGORY_LABELS: Record<string, string> = {
  permintaan_data: "Permintaan Data",
  konsultasi_data: "Konsultasi Data",
  pengaduan_pelayanan: "Pengaduan Pelayanan",
  lainnya: "Lainnya",
  belum_dikategorikan: "Belum Dikategorikan",
};

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds} detik`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} menit ${seconds % 60} detik`;
}

function getMonthOptions() {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    options.push({ value, label });
  }
  return options;
}

export default function DashboardPage() {
  const monthOptions = useMemo(() => getMonthOptions(), []);
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/stats?month=${selectedMonth}`)
      .then((res) => res.json())
      .then(setStats)
      .finally(() => setLoading(false));
  }, [selectedMonth]);

  const selectedLabel = monthOptions.find((m) => m.value === selectedMonth)?.label;

  return (
    <div className="flex h-screen bg-[#0f0f0f] font-sans">
      <Sidebar>
        <div className="flex flex-col items-center justify-center h-56 gap-3 px-6 text-center">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgb(52,211,153)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </div>
          <div>
            <p className="text-xs font-medium text-white/60">Monitoring</p>
            <p className="text-[11px] text-white/25 mt-1 leading-relaxed">
              Statistik percakapan & kategori layanan ditampilkan di panel kanan
            </p>
          </div>
        </div>
      </Sidebar>

      {/* Main Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between" style={{ background: "#141414" }}>
          <h2 className="text-sm font-semibold text-white">Dashboard Monitoring</h2>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-white/[0.06] border border-white/[0.08] text-xs text-white/80 rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500/40"
          >
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value} className="bg-[#141414]">
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div
          className="flex-1 overflow-y-auto px-6 py-6 space-y-4"
          style={{
            backgroundImage: "radial-gradient(circle at 20% 80%, rgba(16,185,129,0.03) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(16,185,129,0.02) 0%, transparent 50%)",
          }}
        >
          {loading ? (
            <p className="text-sm text-white/40">Memuat data {selectedLabel}...</p>
          ) : !stats ? (
            <p className="text-sm text-white/40">Gagal memuat data.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-5">
                  <p className="text-xs text-white/40">Total Chat Eksternal (Bukan Pegawai)</p>
                  <p className="text-3xl font-bold text-white mt-1">{stats.totalExternal}</p>
                  <p className="text-[11px] text-white/25 mt-1">{selectedLabel}</p>
                </div>
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-5">
                  <p className="text-xs text-white/40">Rata-rata Waktu Respons AI</p>
                  <p className="text-3xl font-bold text-white mt-1">{formatDuration(stats.avgResponseSeconds)}</p>
                  <p className="text-[11px] text-white/25 mt-1">{selectedLabel}</p>
                </div>
              </div>

              <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-5">
                <p className="text-xs text-white/40 mb-3">Kategori Percakapan</p>
                <div className="space-y-1">
                  {Object.entries(stats.categoryBreakdown).map(([key, value]) => (
                    <div key={key} className="flex justify-between items-center border-b border-white/[0.05] py-2.5">
                      <span className="text-sm text-white/80">{CATEGORY_LABELS[key] || key}</span>
                      <span className="text-sm font-semibold text-emerald-400">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}