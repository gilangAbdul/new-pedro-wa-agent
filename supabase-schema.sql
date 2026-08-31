-- Run this in Supabase SQL Editor to set up the database

-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  name text,
  mode text NOT NULL DEFAULT 'agent'::text CHECK (mode = ANY (ARRAY['agent'::text, 'human'::text])),
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  is_employee boolean DEFAULT false,
  category text,
  category_updated_at timestamp with time zone,
  instansi text,
  onboarding_status text DEFAULT 'completed'::text,
  CONSTRAINT conversations_pkey PRIMARY KEY (id)
);
CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['user'::text, 'assistant'::text])),
  content text NOT NULL,
  whatsapp_msg_id text UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT messages_pkey PRIMARY KEY (id),
  CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id)
);

create index idx_messages_conversation on messages(conversation_id);
create index idx_conversations_updated on conversations(updated_at desc);

-- Enable Realtime for the dashboard
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table conversations;
