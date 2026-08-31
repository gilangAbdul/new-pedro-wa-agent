import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const monthParam = searchParams.get("month");
    const now = new Date();
    const [yearStr, monthStr] = (
      monthParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    ).split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const startDate = new Date(Date.UTC(year, month - 1, 1)).toISOString();
    const endDate = new Date(Date.UTC(year, month, 1)).toISOString();

    const { data: externalConvos, count: totalExternal } = await supabase
      .from("conversations")
      .select("id, category", { count: "exact" })
      .eq("is_employee", false)
      .gte("created_at", startDate)
      .lt("created_at", endDate);

    const categoryBreakdown: Record<string, number> = {
      permintaan_data: 0,
      konsultasi_data: 0,
      pengaduan_pelayanan: 0,
      lainnya: 0,
      belum_dikategorikan: 0,
    };

    externalConvos?.forEach((c) => {
      const key = c.category || "belum_dikategorikan";
      categoryBreakdown[key] = (categoryBreakdown[key] || 0) + 1;
    });

    const convoIds = externalConvos?.map((c) => c.id) || [];
    let avgResponseSeconds = 0;

    if (convoIds.length > 0) {
      const { data: messages } = await supabase
        .from("messages")
        .select("conversation_id, role, created_at")
        .in("conversation_id", convoIds)
        .order("conversation_id", { ascending: true })
        .order("created_at", { ascending: true });

      const responseTimes: number[] = [];
      if (messages) {
        for (let i = 1; i < messages.length; i++) {
          const prev = messages[i - 1];
          const curr = messages[i];
          if (prev.conversation_id === curr.conversation_id && prev.role === "user" && curr.role === "assistant") {
            const diffMs = new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime();
            responseTimes.push(diffMs / 1000);
          }
        }
      }
      if (responseTimes.length > 0) {
        avgResponseSeconds = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      }
    }

    return NextResponse.json({
      totalExternal: totalExternal || 0,
      avgResponseSeconds: Math.round(avgResponseSeconds),
      categoryBreakdown,
    });
  } catch (error) {
    console.error("Error fetch dashboard stats:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}