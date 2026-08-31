import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

const VALID_CATEGORIES = ["permintaan_data", "konsultasi_data", "pengaduan_pelayanan", "lainnya"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  if (body.mode && !["agent", "human"].includes(body.mode)) {
    return Response.json({ error: "Invalid mode" }, { status: 400 });
  }

  if (body.category && !VALID_CATEGORIES.includes(body.category)) {
    return Response.json({ error: "Invalid category" }, { status: 400 });
  }

  const updatePayload: Record<string, string> = {};
  if (body.mode) updatePayload.mode = body.mode;
  if (body.category) {
    updatePayload.category = body.category;
    updatePayload.category_updated_at = new Date().toISOString();
  }
  if (typeof body.name === "string") updatePayload.name = body.name.trim();
  if (typeof body.instansi === "string") updatePayload.instansi = body.instansi.trim();

  const { data, error } = await supabase
    .from("conversations")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}