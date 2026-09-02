import OpenAI from "openai";
import { PEDRO_SYSTEM_PROMPT } from "@/lib/system-prompt";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Provider cadangan: Gemini langsung via endpoint OpenAI-compatible dari Google
const googleClient = new OpenAI({
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  apiKey: process.env.GOOGLE_API_KEY,
});

const FALLBACK_TEXT = "Maaf, Pedro sedang sibuk merapikan data. Coba lagi nanti ya!";
const OFFICIAL_DOMAINS = ["metrokota.bps.go.id", "cekbansos.kemensos.go.id", "dtsen-form.bps.go.id"];

function sanitizeAIOutput(text: string): string {
  let cleaned = text
    .replace(/<\|tool_call_start\|>[\s\S]*?<\|tool_call_end\|>/g, "")
    .replace(/<\|tool_call_start\|>|<\|tool_call_end\|>/g, "");

  // Ubah markdown link [teks](url) jadi url polos saja
  cleaned = cleaned.replace(/\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, "$2");

  return cleaned.trim();
}

// Fungsi pemanggilan AI dengan fallback otomatis ke Google Gemini
async function callAI(
  messages: { role: "system" | "user" | "assistant"; content: string }[]
): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: process.env.AI_MODEL || "google/gemini-3.1-flash-lite",
      messages,
    });
    const raw = completion.choices[0]?.message?.content || FALLBACK_TEXT;
    return sanitizeAIOutput(raw);
  } catch (primaryError) {
    console.warn("⚠️ Provider utama (OpenRouter) gagal, coba fallback Google Gemini:", primaryError);

    if (process.env.GOOGLE_API_KEY) {
      try {
        const completion = await googleClient.chat.completions.create({
          model: process.env.GOOGLE_MODEL || "gemini-3.1-flash-lite",
          messages,
        });
        const raw = completion.choices[0]?.message?.content || FALLBACK_TEXT;
        return sanitizeAIOutput(raw);
      } catch (fallbackError) {
        console.error("❌ Provider fallback (Google) juga gagal:", fallbackError);
      }
    }

    console.error("❌ Semua provider AI gagal:", primaryError);
    return FALLBACK_TEXT;
  }
}

// 1. Fungsi pencarian bertingkat: situs resmi (spesifik) -> situs resmi (luas) -> web umum
async function searchBPSWebsite(query: string, broaderQuery?: string) {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) return null;

  async function doSearch(q: string, domains?: string[]) {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: q,
        search_depth: "advanced",
        ...(domains ? { include_domains: domains } : {}),
        max_results: 5,
      }),
    });
    const data = await res.json();
    console.log(`📡 STATUS API TAVILY (query: "${q}", domains: ${domains ? domains.join(",") : "umum"}):`, res.status);
    console.log("📥 ISI BALASAN TAVILY:", JSON.stringify(data, null, 2));
    if (!res.ok) {
      console.error("❌ Tavily API error:", data.error || data.message);
      return null;
    }
    if (data.results && data.results.length > 0) {
      return data.results
        .map((item: any) => `- Judul: ${item.title}\n  Info: ${item.content}\n  Link: ${item.url}`)
        .join("\n\n");
    }
    return null;
  }

  try {
    // Lapis 1: query spesifik, dibatasi situs resmi
    let result = await doSearch(query, OFFICIAL_DOMAINS);

    // Lapis 2: query lebih luas, masih dibatasi situs resmi
    if (!result && broaderQuery && broaderQuery !== query) {
      console.log("🔄 Lapis 2: query lebih luas, situs resmi");
      result = await doSearch(broaderQuery, OFFICIAL_DOMAINS);
    }

    // Lapis 3: query lebih luas, TANPA batasan domain (upaya terakhir)
    if (!result) {
      console.log("🔄 Lapis 3: pencarian web umum (di luar situs resmi)");
      result = await doSearch(broaderQuery || query, undefined);
      if (result) {
        result = `⚠️ CATATAN: Hasil berikut BUKAN dari situs resmi BPS Kota Metro, gunakan dengan hati-hati dan tetap sebutkan sumbernya.\n\n${result}`;
      }
    }

    return result;
  } catch (error) {
    console.error("❌ Gagal melakukan web search:", error);
    return null;
  }
}

// 2. Ekstrak kata kunci pencarian dari konteks beberapa pesan terakhir (bukan cuma 1)
async function extractSearchKeywords(
  messages: { role: "user" | "assistant"; content: string }[]
): Promise<{ specific: string; broad: string }> {
  const recentContext = messages.slice(-4)
    .map((m) => `${m.role === "user" ? "User" : "Pedro"}: ${m.content}`)
    .join("\n");

  try {
    const raw = await callAI([
      {
        role: "system",
        content: `Kamu membaca cuplikan percakapan antara pengguna dan asisten statistik BPS. Tentukan TOPIK UTAMA yang sebenarnya sedang dicari pengguna (perhatikan konteks — kalau pesan terakhir adalah komplain/klarifikasi seperti "kok jadi X" atau "bukan itu maksud saya", topik aslinya biasanya ada di pesan sebelumnya, bukan di kata-kata komplain itu).

Balas HANYA dalam format JSON murni: {"specific": "kata kunci spesifik 3-6 kata", "broad": "kata kunci lebih umum/luas 2-3 kata dari topik yang sama"}

Contoh: percakapan membahas "data desil pengeluaran", lalu user komplain "kok data desil malah jadi inflasi" -> {"specific": "desil pengeluaran Kota Metro", "broad": "desil pengeluaran"}`,
      },
      { role: "user", content: recentContext },
    ]);

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const cleaned = jsonMatch ? jsonMatch[0] : raw;
    const parsed = JSON.parse(cleaned);
    return {
      specific: parsed.specific || messages[messages.length - 1]?.content || "",
      broad: parsed.broad || parsed.specific || "",
    };
  } catch (error) {
    console.error("❌ Gagal ekstrak keyword pencarian:", error);
    const fallback = messages[messages.length - 1]?.content || "";
    return { specific: fallback, broad: fallback };
  }
}

export async function getAIResponse(
  messages: { role: "user" | "assistant"; content: string }[]
) {
  const { specific, broad } = await extractSearchKeywords(messages);
  console.log("🔑 Keyword pencarian — spesifik:", specific, "| luas:", broad);

  const searchResults = await searchBPSWebsite(specific, broad);
  console.log("🔍 HASIL RAG GOOGLE BPS METRO:\n", searchResults);

  let dynamicSystemPrompt = PEDRO_SYSTEM_PROMPT;

  if (searchResults) {
    dynamicSystemPrompt += `\n\n=== DATA TERBARU DARI HASIL PENCARIAN WEB (PRIORITAS UTAMA) ===\n${searchResults}\n\nPENTING: Gunakan informasi di atas untuk menjawab pertanyaan pengguna dengan akurat. JANGAN MENGARANG ANGKA/DATA. Jika Anda memberikan angka dari informasi di atas, WAJIB sertakan URL Link sumbernya agar pengguna bisa membacanya langsung. Jika hasil pencarian TIDAK PERSIS membahas apa yang diminta pengguna tapi masih relevan (topik sama, data berbeda), sampaikan apa yang tersedia dengan jujur dan jelaskan bahwa itu bukan angka persis yang diminta.`;
  }

  return await callAI([
    { role: "system", content: dynamicSystemPrompt },
    ...messages,
  ]);
}

// Fungsi ekstrak nama & instansi dari pesan onboarding pengguna
export async function extractContactInfo(
  text: string
): Promise<{ name: string | null; instansi: string | null }> {
  try {
    const raw = await callAI([
      {
        role: "system",
        content: `Kamu adalah sistem ekstraksi data. Dari pesan pengguna, ambil NAMA orang dan NAMA INSTANSI/LEMBAGA asalnya. Balas HANYA dengan JSON murni, tanpa kalimat pembuka/penutup, tanpa markdown code block. Format wajib: {"name": "...", "instansi": "..."}. Jika tidak ditemukan, isi dengan null (bukan string "null"). Contoh input: "saya soke, dari dinas pendidikan" -> output: {"name": "Soke", "instansi": "Dinas Pendidikan"}`,
      },
      { role: "user", content: text },
    ]);

    console.log("🔍 RAW hasil extractContactInfo:", raw);

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const cleaned = jsonMatch ? jsonMatch[0] : raw.replace(/```json|```/g, "").trim();

    const parsed = JSON.parse(cleaned);
    return {
      name: parsed.name && parsed.name !== "null" ? parsed.name : null,
      instansi: parsed.instansi && parsed.instansi !== "null" ? parsed.instansi : null,
    };
  } catch (error) {
    console.error("❌ Gagal ekstrak nama/instansi:", error);
    return { name: null, instansi: null };
  }
}