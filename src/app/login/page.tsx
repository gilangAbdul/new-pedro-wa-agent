"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        const next = searchParams.get("next") || "/";
        router.push(next);
        router.refresh();
      } else {
        setError("PIN salah, coba lagi.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-8 w-full max-w-xs flex flex-col gap-4"
    >
      <div className="text-center mb-2">
        <img src="/logo.png" alt="New Pedro" className="w-14 h-14 mx-auto rounded-xl mb-3" />
        <h1 className="text-white font-semibold text-lg">New Pedro</h1>
        <p className="text-white/40 text-xs mt-1">Masukkan PIN akses</p>
      </div>
      <input
        type="password"
        inputMode="numeric"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        placeholder="PIN"
        autoFocus
        className="bg-white/[0.06] border border-white/[0.08] text-white text-center text-xl tracking-widest rounded-lg px-4 py-3 focus:outline-none focus:border-emerald-500/50"
      />
      {error && <p className="text-red-400 text-xs text-center">{error}</p>}
      <button
        type="submit"
        disabled={loading || !pin}
        className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
      >
        {loading ? "Memeriksa..." : "Masuk"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex h-screen items-center justify-center bg-[#0f0f0f]">
      <Suspense fallback={<div className="text-white/40 text-sm">Memuat...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}