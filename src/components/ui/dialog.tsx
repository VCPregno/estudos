"use client";

import * as React from "react";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  className,
  children,
  titulo,
  descricao,
  ...props
}: React.ComponentProps<typeof D.Content> & { titulo: string; descricao?: string }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-background/70 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <D.Content
        className={cn(
          "fixed inset-x-3 top-[5dvh] z-50 mx-auto flex max-h-[90dvh] max-w-2xl flex-col overflow-hidden rounded-xl border bg-card shadow-xl outline-none",
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div className="min-w-0">
            <D.Title className="text-lg font-semibold tracking-tight">{titulo}</D.Title>
            {descricao ? (
              <D.Description className="mt-0.5 text-sm text-muted-foreground">{descricao}</D.Description>
            ) : (
              <D.Description className="sr-only">{titulo}</D.Description>
            )}
          </div>
          <D.Close className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40" aria-label="Fechar">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </D.Content>
    </D.Portal>
  );
}
