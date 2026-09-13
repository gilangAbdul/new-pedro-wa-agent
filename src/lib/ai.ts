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
        include_raw_content: true, // minta isi halaman lebih lengkap, bukan cuma snippet pendek
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
        .map((item: any) => {
          let isi = item.content; // default: snippet pendek
          if (item.raw_content) {
            const raw = item.raw_content;
            if (raw.length <= 5000) {
              isi = raw;
            } else {
              // Ambil awal (konteks) + bagian tengah (kemungkinan besar tabel/angka ada di sini)
              const awal = raw.slice(0, 2000);
              const tengah = raw.slice(Math.floor(raw.length / 2) - 1500, Math.floor(raw.length / 2) + 1500);
              isi = `${awal}\n[...]\n${tengah}`;
            }
          }
          return `- Judul: ${item.title}\n  Info: ${isi}\n  Link: ${item.url}`;
        })
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


// 2. Ekstrak kata kunci pencarian dari konteks beberapa pesan terakhir
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
        content: `Kamu membaca cuplikan percakapan pengguna dan asisten statistik. Tentukan TOPIK UTAMA yang dicari pengguna saat ini. Jika pengguna berganti topik (misal dari "pengangguran" ke "PNS"), fokuslah HANYA pada topik yang baru.
Balas HANYA dalam format JSON murni: {"specific": "kata kunci spesifik", "broad": "kata kunci umum ditambah 'BPS Kota Metro tabel publikasi'"}

Contoh input: "kalau jumlah pns di kota metro?"
Contoh output: {"specific": "jumlah PNS Kota Metro", "broad": "data jumlah pegawai negeri sipil PNS BPS Kota Metro tabel publikasi"}

Jika pertanyaan bersifat umum/strategis (bukan angka indikator spesifik), sertakan juga variasi query yang menyebut "narasi metro terkini [bulan-tahun-saat-ini]" pada field "broad".},
`,
      
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
  
  const todayStr = new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
  dynamicSystemPrompt += `\n\n[INFO SISTEM REAL-TIME: Hari ini adalah tanggal ${todayStr}. Gunakan informasi waktu ini sebagai acuan mutlak.]`;

  if (searchResults) {
    dynamicSystemPrompt += `\n\n=== DATA TERBARU DARI HASIL PENCARIAN WEB (PRIORITAS UTAMA) ===\n${searchResults}\n\n`;
    
    // Instruksi Kritis & Aturan Format Paksa (Berimbang & Anti-Halusinasi URL)
    dynamicSystemPrompt += `⚠️ ATURAN FINAL SEBELUM MENJAWAB:
1. GAYA WHATSAPP: Jawablah dengan santai dalam 2-4 kalimat pendek. BUKAN format laporan.
2. DILARANG KERAS MENGGUNAKAN FORMAT LAPORAN: Jangan menggunakan daftar bernomor, bullet points, atau sub-judul tebal (seperti "*Sumber:*", "*Catatan:*").
3. CEGAH HALUSINASI URL (PENTING): JANGAN mendaur ulang URL dari topik sebelumnya. Jika pengguna beralih menanyakan PNS, jangan berikan URL tentang pengangguran (misal yang berakhiran subject=531). Gunakan HANYA URL yang benar-benar tertera pada HASIL PENCARIAN WEB di atas.
4. SUMBER BERIMBANG: Jika hasil pencarian menampilkan "Tabel Statistik", utamakan data tersebut. Jika yang muncul adalah "Berita/Publikasi/Narasi", gunakan informasinya sebagai pelengkap, asalkan angkanya logis dan sesuai dengan yang ditanyakan pengguna.`;
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