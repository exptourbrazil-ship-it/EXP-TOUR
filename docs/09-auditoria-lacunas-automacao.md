# Auditoria de lacunas — O que ainda falta para o cenário 100% automatizado
## Revisão crítica do desenho completo (v3 + Fornecedores v2 + Financeiro/Parcelamento)

O que está desenhado até aqui cobre muito bem a **jornada feliz**: proposta → entrada → contrato → matrícula → documentos → visto → embarque → retorno, com fornecedores e financeiro automatizados. A experiência de duas décadas neste setor diz que o que quebra operações automatizadas nunca é a jornada feliz; são as **exceções, o fiscal, as pessoas ao redor do estudante e o que acontece quando algo muda**. É exatamente aí que estão os buracos. Organizei por gravidade.

---

## A. Exceções da jornada (o buraco mais grave)

A máquina de estados atual só anda para frente. O setor, não. Cada um destes eventos é frequente o suficiente para merecer fluxo automatizado próprio, e nenhum está desenhado:

**A1. Visto negado.** A exceção mais comum e mais cara do setor. Precisa de: fluxo definido no contrato (o que é reembolsado, o que a escola devolve, o que é retido), gatilho `Visto_Status = Negado` que pausa a régua de cobrança na hora (continuar cobrando cliente com visto negado é o pior incidente de marca possível), pedido automático de refund à escola se a remessa já foi feita (as políticas de refund por visa refusal variam por escola e devem ser campo do cadastro do fornecedor), cálculo automático do acerto com o cliente, e oferta estruturada de alternativas (reaplicação, troca de destino) antes do cancelamento, porque metade dos vistos negados é recuperável como venda para outro destino.

**A2. Adiamento de início (deferral).** Extremamente comum: cliente pede para empurrar o início em 1 a 3 meses. Hoje isso quebraria tudo: Anexo I, marcos do parcelamento, prazo de pagamento da escola, checklist, datas da máquina. Precisa de um fluxo "alterar programa" que, aprovada a mudança com a escola (via portal do fornecedor), recalcule em cascata: novas datas → novos marcos → cronograma revalidado → aditivo eletrônico do cliente → tudo pelo mesmo mecanismo do editor de parcelas. O deferral deve ser um evento do motor, não uma gambiarra manual no CRM.

**A3. Cancelamento (nas suas quatro versões).** Arrependimento em 7 dias (refund automático via API do MP, já previsto, mas sem o fluxo completo de encerramento do caso); cancelamento pós-7-dias pelo cliente (cálculo automático da multa/retenção conforme cláusula, acerto na moeda do programa, refund do saldo); cancelamento por inadimplência (hoje a régua para em D+10 com tarefa humana, mas não existe o desfecho: em que ponto a vaga é liberada, a escola avisada, o contrato rescindido); e cancelamento pela escola (curso não abriu turma, escola fechou, acontece mais do que parece: realocação ou reembolso integral). Cada um é um caminho da máquina de estados com ações, prazos e comunicação próprios.

**A4. Alterações de escopo.** Extensão de semanas, upgrade de acomodação, adição de serviço depois da compra. Isso é **receita** (extensão in-country é das vendas de melhor margem do setor) e hoje não tem caminho: precisa de "aditivo de compra" no portal, que gera cobrança complementar, atualiza Anexo I, notifica a escola e recalcula marcos. O mesmo motor do checkout, reaproveitado para venda incremental.

---

## B. Fiscal e financeiro (o buraco silencioso)

**B1. Emissão de NFS-e.** Nenhum documento tocou nisso, e é automação obrigatória: cada pagamento confirmado deve emitir a nota de serviço automaticamente (integração com a prefeitura via emissor/API, ou Zoho Books se parametrizado para NFS-e brasileira via integrador). Operação que emite nota manualmente todo mês não é 100% automatizada; é 80% automatizada com um gargalo fiscal no meio.

**B2. Comissões internas.** O funil de fechamento por consultor existe no cockpit, mas o cálculo da comissão de venda (e eventual comissão sobre ancilares) não. Regra parametrizada por instância, apurada automaticamente por evento `Entrada_Paga`/quitação, com extrato por consultor. Comissão calculada em planilha é a planilha paralela que o desenho inteiro tenta eliminar.

**B3. Acertos e reembolsos parciais.** Os fluxos do bloco A exigem um motor de acerto: dado um cancelamento/alteração na data X, calcular retenções, multas, valores já remetidos à escola, refund esperado do fornecedor e saldo a devolver ou cobrar, na moeda do programa, com memória de cálculo. Sem isso, toda exceção vira negociação artesanal.

**B4. Meios de pagamento além do PIX à vista.** O desenho prevê cartão como evolução, mas vale registrar o que o mercado pratica: parcelamento no cartão de crédito (12x) é decisivo para o ticket deste setor. Entra na onda 4 com análise de MDR versus conversão, mas o modelo de dados das parcelas já deve nascer comportando "parcela liquidada por cartão em N vezes".

---

## C. As pessoas ao redor do estudante (buraco de produto)

**C1. Multiusuário por conta.** O desenho assume um login: o contratante. Na prática do setor, no caso de menores (e de boa parte dos maiores), quem paga é o pai, quem viaja é o filho, e a mãe quer acompanhar. O portal precisa de **papéis por caso**: Contratante (vê tudo, edita financeiro), Estudante (vê jornada, checklist, documentos; não vê ou não edita financeiro, configurável), Acompanhante/segundo responsável (leitura). Um login por pessoa, nunca senha compartilhada, com convite pelo contratante. Isso muda modelo de dados de autenticação e é muito mais barato agora do que depois.

**C2. Notificações por papel.** Decorrência direta: o lembrete de parcela vai ao contratante; o "seu certificado chegou" vai ao estudante; o embarque vai a todos. A matriz de notificação da v3 ganha a dimensão "papel".

---

## D. O início do funil ainda é manual (buraco de escala)

**D1. Catálogo de preços e motor de cotação.** Tudo começa em "o consultor fecha a proposta no CRM", mas montar essa proposta hoje significa consultar price lists de escolas em PDF, aplicar promoções vigentes e calcular manualmente. O buraco: um **catálogo estruturado por fornecedor** (programas, durações, preços por temporada, promoções com validade, taxas de matrícula/material, acomodações) que o consultor consulta e monta a proposta em minutos, com preço sempre atual. É trabalhoso de popular e manter (price lists anuais chegam em setembro/outubro), mas é o que destrava velocidade de venda e elimina erro de preço, a causa número um de margem perdida em agência. Para a Forio, esse catálogo é ainda mais estratégico: é o coração do marketplace.

**D2. Validade e vagas.** Promoção vencida aplicada em proposta e turma sem vaga vendida são os dois erros clássicos. O catálogo com validade resolve o primeiro; o segundo depende de confirmação da escola, e o portal do fornecedor pode absorver isso ("confirmar disponibilidade" como etapa relâmpago antes da proposta, para casos de high season).

---

## E. Durante o programa (o estado 7 está vazio demais)

**E1. Ocorrências e suporte estruturado.** O desenho tem contatos de emergência e um "canal de suporte com SLA", mas não tem **ticketing**: mudança de homestay, problema acadêmico, sinistro de seguro, perda de documento, emergência médica. Cada ocorrência precisa de registro, categoria, dono, SLA e histórico no caso, porque ocorrência mal gerida durante o programa é o que derruba o NPS que o motor de retorno vai colher. O acionamento do seguro merece fluxo próprio (dados da apólice já estão no cofre; o portal deve guiar o acionamento passo a passo).

**E2. Check-ins programados.** O D+3 existe; faltam os marcos de programa longo: D+30, metade do curso, D-30 do fim (este último é o gatilho comercial da **extensão in-country**, conectando com A4: "faltam 5 semanas; quer estender?"). Programas de 6 meses sem contato estruturado no meio são renovação perdida.

**E3. Retorno antecipado e interrupção.** Estudante que volta antes (saúde, família, insatisfação) precisa do mesmo tratamento de exceção do bloco A: recálculo, refund parcial da escola quando aplicável, seguro, e encerramento digno da jornada.

---

## F. Plataforma e governança (buracos de maturidade)

**F1. Permissões internas (RBAC do cockpit).** O time também precisa de papéis: consultor vê seus deals, financeiro vê tesouraria, operação vê documentos e fornecedores, gestor vê tudo. Não desenhado.

**F2. Versionamento de templates jurídicos.** Contrato-mestre, Termo de Adesão e ficha mudam todo ano. Cada aceite/assinatura já grava a versão (bem), mas falta o processo: repositório versionado dos templates com vigência, e o motor sempre usando a versão vigente na data. Barato, evita o pesadelo de "qual contrato esse cliente de 2027 assinou?".

**F3. LGPD operacional.** Política e consentimentos estão desenhados; falta o fluxo de **direitos do titular**: pedido de acesso/portabilidade/exclusão com prazo legal de resposta, exclusão que respeita retenções legais (fiscal, contratual) e propaga ao que foi compartilhado com fornecedores. Um formulário no portal + fluxo interno com SLA resolve.

**F4. Observabilidade e continuidade.** A "saúde da automação" no cockpit cobre o funcional; falta o operacional: ambiente de homologação separado (testar mudança de motor em produção com cliente real é roleta), alertas ativos de falha (webhook do MP fora do ar às 23h de sexta precisa acordar alguém, não esperar o painel de segunda), e rotina de backup/restore testada dos dados do backend próprio.

---

## G. Relacionamento de longo prazo (buraco de LTV)

**G1. A esteira pós-D+45.** O motor de retorno termina na sugestão de próxima viagem em D+45. O LTV real deste setor está nos 6 a 24 meses seguintes: nutrição por perfil (quem fez idiomas recebe conteúdo de pathway; a família do menor recebe a esteira do irmão), aniversário de intercâmbio ("há 1 ano você chegava em Toronto"), e reativação do código de indicação em momentos de pico (resultado do ENEM, férias, black friday do setor). É marketing automation clássico em cima dos dados que o motor já coleta; não construir é deixar o ativo mais caro da operação (a base de ex-alunos satisfeitos) parado.

**G2. Depoimentos e embaixadores.** O NPS ≥ 9 do retorno é a fila natural de captação de depoimento em vídeo/texto (com termo de uso de imagem eletrônico, mesmo mecanismo de aceite) e de recrutamento de embaixadores para as feiras e para o conteúdo. Um gatilho a mais no motor de retorno, valor de marketing desproporcional ao esforço.

---

## Priorização honesta

| Prioridade | Lacunas | Racional |
|---|---|---|
| **Antes do primeiro cliente real** | A1 (visto negado, ao menos a pausa de cobrança e a política escrita), A3 (arrependimento 7 dias completo), B1 (NFS-e), C1 (multiusuário no modelo de dados, mesmo que a UI venha depois), F2 (versionamento desde o template nº 1) | São os que geram dano jurídico, fiscal ou de marca se faltarem no caso 1 |
| **Onda 2–3** | A2 (deferral), A4 (alterações/extensão), B3 (motor de acerto), D1 (catálogo de preços), E1 (ocorrências), C2, F1, F3 | Frequentes o suficiente para não sobreviverem como processo manual além dos primeiros meses |
| **Onda 4+** | B2 (comissões), B4 (cartão), D2 (vagas), E2 (check-ins longos), F4 (homologação/alertas ativos), G1, G2 | Maturidade e crescimento; nenhum bloqueia o lançamento |

Uma observação final de estrategista, não de arquiteto: a lista acima parece grande, mas o desenho que vocês já têm resolve o problema difícil (o motor de eventos, a fonte de verdade única, os marcos). Quase tudo neste documento é **caminho novo sobre trilho existente**: visto negado é um estado a mais, deferral é o editor de parcelas generalizado para datas de programa, extensão é o checkout reaproveitado, NFS-e é um handler a mais no barramento. O risco real não é técnico; é de sequência: tentar fechar todos os buracos antes de lançar. A priorização acima existe para isso: cinco itens antes do cliente 1, o resto atrás de clientes reais ensinando o que dói primeiro.
