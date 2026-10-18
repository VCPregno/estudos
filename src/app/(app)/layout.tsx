import { Cabecalho } from "@/components/layout/cabecalho";
import { NavegacaoMobile, Sidebar } from "@/components/layout/navegacao";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Cabecalho />
        <main className="flex-1 px-4 pt-6 pb-24 md:px-8 md:pb-10">{children}</main>
      </div>
      <NavegacaoMobile />
    </div>
  );
}
