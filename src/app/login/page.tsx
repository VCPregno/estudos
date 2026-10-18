import type { Metadata } from "next";
import { BookOpenText } from "lucide-react";
import { supabaseConfigurado } from "@/lib/env";
import { FormLogin } from "./form-login";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <span className="mb-6 grid size-10 place-items-center rounded-xl bg-highlight text-highlight-foreground">
          <BookOpenText className="size-5" strokeWidth={2.25} />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Entrar</h1>
        <p className="mt-1 text-sm text-muted-foreground">Use o e-mail e a senha do usuário criado no Supabase.</p>
        {supabaseConfigurado() ? (
          <FormLogin />
        ) : (
          <p className="mt-6 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            O Supabase ainda não está configurado, então o app roda em modo demonstração e não precisa de login.
          </p>
        )}
      </div>
    </main>
  );
}
