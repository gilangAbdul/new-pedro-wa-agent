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

// 1. Fungsi Rahasia untuk Mencari di Web BPS Metro
async function searchBPSWebsite(query: string) {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query: query,
        search_depth: "advanced",
        include_domains: ["metrokota.bps.go.id", "cekbansos.kemensos.go.id"],
        max_results: 3,
      }),
    });

    const data = await res.json();

    console.log("📡 STATUS API TAVILY:", res.status);
    console.log("📥 ISI BALASAN TAVILY:", JSON.stringify(data, null, 2));

    if (!res.ok) {
      console.error("❌ Tavily API error:", data.error || data.message);
      return null;
    }

    if (data.results && data.results.length > 0) {
      const snippets = data.results.map((item: any) =>
        `- Judul: ${item.title}\n  Info: ${item.content}\n  Link: ${item.url}`
      ).join('\n\n');
      return snippets;
    }

    return null;
  } catch (error) {
    console.error("❌ Gagal melakukan web search:", error);
    return null;
  }
}

function sanitizeAIOutput(text: string): string {
  let cleaned = text
    .replace(/<\|tool_call_start\|>[\s\S]*?<\|tool_call_end\|>/g, "")
    .replace(/<\|tool_call_start\|>|<\|tool_call_end\|>/g, "");

  // Ubah markdown link [teks](url) jadi url polos saja
  cleaned = cleaned.replace(/\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, "$2");

  return cleaned.trim();
}

// 2. Fungsi pemanggilan AI dengan fallback otomatis ke Google Gemini
async function callAI(
  messages: { role: "system" | "user" | "assistant"; content: string }[]
): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: process.env.AI_MODEL || "google/gemini-1.5-flash",
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

export async function getAIResponse(
  messages: { role: "user" | "assistant"; content: string }[]
) {
  const lastUserMessage = messages[messages.length - 1]?.content || "";

  const searchResults = await searchBPSWebsite(lastUserMessage);
  console.log("🔍 HASIL RAG GOOGLE BPS METRO:\n", searchResults);

  let dynamicSystemPrompt = PEDRO_SYSTEM_PROMPT;

  if (searchResults) {
    dynamicSystemPrompt += `\n\n=== DATA TERBARU DARI HASIL PENCARIAN WEB (PRIORITAS UTAMA) ===\n${searchResults}\n\nPENTING: Gunakan informasi di atas untuk menjawab pertanyaan pengguna dengan akurat. JANGAN MENGARANG ANGKA/DATA. Jika Anda memberikan angka dari informasi di atas, WAJIB sertakan URL Link sumbernya agar pengguna bisa membacanya langsung.`;
  }

  return await callAI([
    { role: "system", content: dynamicSystemPrompt },
    ...messages,
  ]);
}

// 6. Fungsi baru: ekstrak nama & instansi dari pesan onboarding pengguna
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