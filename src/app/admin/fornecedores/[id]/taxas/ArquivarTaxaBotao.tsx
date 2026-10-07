"use client";

import { useRouter } from "next/navigation";
import ArquivarBotao from "@/components/ArquivarBotao";

// Arquivar uma taxa a partir da aba Taxas do hub (mesma rota e confirmação do
// editor de taxa). Recarrega a lista ao concluir.
export default function ArquivarTaxaBotao({ feeId, nome }: { feeId: string; nome: string }) {
  const router = useRouter();
  return (
    <ArquivarBotao
      titulo={`Arquivar a taxa "${nome}"?`}
      descricao={
        <p>
          A taxa deixa de ser cobrada em cotações novas. Cotações já emitidas não mudam de valor. É reversível
          (arquivamento, não exclusão). Taxas vindas de price list da escola são geridas por aquele fluxo e serão recusadas.
        </p>
      }
      urlArquivar={`/api/admin/catalog/fees/${feeId}`}
      aoArquivar={() => router.refresh()}
    />
  );
}
