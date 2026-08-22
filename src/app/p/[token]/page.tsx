import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import Logo from "@/components/Logo";
import { getPublicQuote } from "@/lib/quote-issue-service";
import { tokenValidoFormato } from "@/lib/quote-issue";
import PortalClient from "./PortalClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Portal PUBLICO do estudante (spec 9): sem auth, o token opaco e a posse.
// noindex/nofollow; nenhum dado do estudante alem do primeiro nome; nenhum
// identificador interno no HTML (as opcoes vao indexadas). Os valores foram
// congelados na emissao — o portal so LE, nunca recalcula.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Sua cotacao — EXP Tour",
};

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-cream/40">
      <header className="bg-brand">
        <div className="mx-auto max-w-3xl px-5 py-4 md:px-8">
          <Logo escuro />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-8 md:px-8">{children}</main>
    </div>
  );
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <Moldura>
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center">
        <h1 className="font-serif text-2xl text-brand">{titulo}</h1>
        <p className="mt-2 text-sm text-neutral-600">{texto}</p>
      </div>
    </Moldura>
  );
}

export default async function PortalEstudantePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!tokenValidoFormato(token)) {
    return <Aviso titulo="Cotacao nao encontrada" texto="Verifique o link recebido ou fale com a EXP Tour." />;
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );

  let dados = null;
  try {
    dados = await getPublicQuote(supabase, token);
  } catch {
    return <Aviso titulo="Nao foi possivel abrir a cotacao" texto="Tente novamente em instantes ou fale com a EXP Tour." />;
  }

  if (!dados) {
    return (
      <Aviso
        titulo="Cotacao indisponivel"
        texto="Este link pode ter expirado ou sido desativado. Fale com a EXP Tour para receber um novo."
      />
    );
  }

  return (
    <Moldura>
      <PortalClient token={token} dados={dados} />
    </Moldura>
  );
}
