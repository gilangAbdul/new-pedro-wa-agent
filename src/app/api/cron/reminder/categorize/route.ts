import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const CATEGORIES = ["permintaan_data", "konsultasi_data", "pengaduan_pelayanan", "lainnya"] as const;

async function classifyConversation(messages: { role: string; content: string }[]) {
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

  const completion = await openai.chat.completions.create({
    model: process.env.AI_MODEL || "google/gemini-1.5-flash",
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
  });

  const raw = completion.choices[0]?.message?.content?.trim().toLowerCase() || "lainnya";
  return CATEGORIES.find((c) => raw.includes(c)) || "lainnya";
}

export async function GET() {
  try {
    const { data: conversations, error } = await supabase
      .from("conversations")
      .select("id, phone, category, category_updated_at, updated_at")
      .eq("is_employee", false)
      .or("category.is.null,category_updated_at.lt.updated_at");

    if (error) throw error;
    if (!conversations || conversations.length === 0) {
      return NextResponse.json({ message: "Tidak ada percakapan yang perlu dikategorikan" });
    }

    const results = [];

    for (const convo of conversations) {
      const { data: messages } = await supabase
        .from("messages")
        .select("role, content")
        .eq("conversation_id", convo.id)
        .order("created_at", { ascending: true })
        .limit(20);

      if (!messages || messages.length === 0) continue;

      const category = await classifyConversation(messages);

      await supabase
        .from("conversations")
        .update({ category, category_updated_at: new Date().toISOString() })
        .eq("id", convo.id);

      results.push({ phone: convo.phone, category });
    }

    return NextResponse.json({ success: true, count: results.length, results });
  } catch (error) {
    console.error("Error kategorisasi:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}