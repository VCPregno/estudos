import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";

/** Cliente Supabase para Server Components, Server Actions e Route Handlers. */
export async function criarClienteServidor() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Chamado de um Server Component: a renovação da sessão acontece no proxy.
        }
      },
    },
  });
}

/** Usuário autenticado ou null. Sempre valida o token no servidor (getUser, não getSession). */
export async function usuarioAtual() {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}
