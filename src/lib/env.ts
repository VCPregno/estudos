/**
 * Configuração lida do ambiente. Sem Supabase configurado o app roda em
 * "modo demonstração": telas com dados de exemplo, nada é gravado.
 */

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export function supabaseConfigurado(): boolean {
  return Boolean(supabaseUrl && supabasePublishableKey);
}
