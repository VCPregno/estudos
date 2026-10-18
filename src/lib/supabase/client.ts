"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";

export function criarClienteNavegador() {
  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}
