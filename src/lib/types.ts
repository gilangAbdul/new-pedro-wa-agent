export interface Conversation {
  id: string;
  phone: string;
  name: string | null;
  instansi: string | null;
  mode: "agent" | "human";
  is_employee: boolean;
  category: "permintaan_data" | "konsultasi_data" | "pengaduan_pelayanan" | "lainnya" | null;
  category_updated_at: string | null;
  updated_at: string;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  whatsapp_msg_id: string | null;
  created_at: string;
}

export interface ConversationWithLastMessage extends Conversation {
  last_message: string | null;
}