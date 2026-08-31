import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const CATEGORIES = ["permintaan_data", "konsultasi_data", "pengaduan_pelayanan", "lainnya"] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: messages } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(20);

  if (!messages || messages.length === 0) {
    return Response.json({ error: "Belum ada pesan untuk dikategorikan" }, { status: 400 });
  }

  const transcript = messages
    .map((m) => `${m.role === "user" ? "Pengguna" : "Pedro"}: ${m.content}`)
    .join("\n");

  const prompt = `Kamu adalah sistem klasifikasi percakapan layanan BPS. Baca transkrip percakapan berikut, lalu klasifikasikan topik utamanya ke SALAH SATU kategori berikut saja (jawab hanya dengan salah satu kata, tanpa penjelasan tambahan):

- permintaan_data (pengguna meminta data/statistik tertentu)
- konsultasi_data (pengguna bertanya cara membaca/menggunakan/menginterpretasi data)
- pengaduan_pelayanan (pengguna mengeluh/komplain soal pelayanan)
- lainnya (di luar tiga kategori di atas)

Transkrip:
${transcript}

Jawaban (satu kata saja):`;

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.AI_MODEL || "google/gemini-1.5-flash",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    });

    const raw = completion.choices[0]?.message?.content?.trim().toLowerCase() || "lainnya";
    const category = CATEGORIES.find((c) => raw.includes(c)) || "lainnya";

    const { data, error } = await supabase
      .from("conversations")
      .update({ category, category_updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return Response.json(data);
  } catch (error) {
    console.error("Gagal kategorisasi:", error);
    return Response.json({ error: "Gagal melakukan kategorisasi" }, { status: 500 });
  }
}