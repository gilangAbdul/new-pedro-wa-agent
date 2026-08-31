import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { getAIResponse, extractContactInfo } from "@/lib/ai";
import { isEmployeeNumber } from "@/lib/employees";

const GREETING_TEMPLATE = `Halo! 👋\n\nTerima kasih _#SahabatData telah menghubungi Pedro✨\nSelamat datang di Pelayanan Statistik Terpadu (New Pedro) BPS Kota Metro.
Untuk memberikan pelayanan yang lebih baik, mohon untuk mengirimkan *nama* dan *asal instansi/lembaga* Anda dalam satu pesan ya.\n_Contoh: "Nama saya Budi, dari Dinas Pendidikan Kota Metro"_`;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { from, text, type, whatsappMsgId } = body;

  if (type !== "chat" && type !== "text") {
    return Response.json({ status: "non_text" });
  }

  const phone = from.replace("@c.us", "");

  try {
    let { data: conversation } = await supabase
      .from("conversations")
      .select("*")
      .eq("phone", phone)
      .single();

    // Kontak benar-benar baru
    if (!conversation) {
      const employee = isEmployeeNumber(phone);
      const { data: newConvo } = await supabase
        .from("conversations")
        .insert({
          phone,
          is_employee: employee,
          onboarding_status: employee ? "completed" : "pending",
        })
        .select()
        .single();
      conversation = newConvo;

      if (!conversation) {
        return Response.json({ error: "Failed to create conversation" }, { status: 500 });
      }

      // Simpan pesan pertama user
      const { error: firstInsertError } = await supabase.from("messages").insert({
        conversation_id: conversation.id,
        role: "user",
        content: text,
        whatsapp_msg_id: whatsappMsgId || null,
      });

      if (firstInsertError?.code === "23505") {
        return Response.json({ status: "duplicate" });
      }

      // Kalau bukan pegawai, kirim template sapaan dulu, JANGAN lanjut ke AI
      if (!employee) {
        await sendWhatsAppMessage(phone, GREETING_TEMPLATE);
        await supabase.from("messages").insert({
          conversation_id: conversation.id,
          role: "assistant",
          content: GREETING_TEMPLATE,
        });
        return Response.json({ status: "onboarding_started" });
      }
    } else {
      // Simpan pesan user untuk conversation yang sudah ada
      const { error: insertError } = await supabase.from("messages").insert({
        conversation_id: conversation.id,
        role: "user",
        content: text,
        whatsapp_msg_id: whatsappMsgId || null,
      });

      if (insertError?.code === "23505") {
        return Response.json({ status: "duplicate" });
      }
    }

    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversation.id);

    // Kalau masih menunggu jawaban nama & instansi
    if (conversation.onboarding_status === "pending") {
      const { name, instansi } = await extractContactInfo(text);

      if (name && instansi) {
        await supabase
          .from("conversations")
          .update({ name, instansi, onboarding_status: "completed" })
          .eq("id", conversation.id);

        const confirmMsg = `Terima kasih, ${name}! Senang bisa membantu perwakilan dari ${instansi}. 🙏\n\nAda yang bisa saya bantu terkait data atau layanan BPS Kota Metro?`;
        await sendWhatsAppMessage(phone, confirmMsg);
        await supabase.from("messages").insert({
          conversation_id: conversation.id,
          role: "assistant",
          content: confirmMsg,
        });
        return Response.json({ status: "onboarding_completed" });
      } else {
        const retryMsg = `Mohon maaf, saya belum menangkap nama dan instansi Anda dengan jelas. 🙏\n\nBoleh diulangi dengan format:\n*Nama: [nama Anda]*\n*Instansi: [asal instansi Anda]*`;
        await sendWhatsAppMessage(phone, retryMsg);
        await supabase.from("messages").insert({
          conversation_id: conversation.id,
          role: "assistant",
          content: retryMsg,
        });
        return Response.json({ status: "onboarding_retry" });
      }
    }

    // Mode human, tidak auto-reply
    if (conversation.mode === "human") {
      return Response.json({ status: "stored_for_human" });
    }

    // Alur normal: AI + RAG Tavily
    const { data: recentMessages } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(4);

    const history = recentMessages ? recentMessages.reverse() : [];

    const aiResponse = await getAIResponse(
      history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }))
    );

    await sendWhatsAppMessage(phone, aiResponse);

    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "assistant",
      content: aiResponse,
    });

    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversation.id);

    return Response.json({ status: "replied" });
  } catch (error) {
    console.error("Incoming message error:", error);
    return Response.json({ status: "error" }, { status: 500 });
  }
}