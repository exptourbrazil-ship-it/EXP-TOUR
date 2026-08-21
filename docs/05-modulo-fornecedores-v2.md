# Módulo Fornecedores — v2
## Conferência automatizada de uploads, pagamento às escolas (D-30) e ficha de matrícula bilíngue auto-preenchida

Substitui a v1 do módulo. Três mudanças: o filtro humano do gatilho 3 vira exceção de uma conferência automatizada por cruzamento de dados; entra o motor de pagamento às escolas com padrão de 30 dias antes do início; e a ficha de matrícula ganha especificação completa de auto-preenchimento. Seções 1, 2, 5 e demais gatilhos permanecem como na v1.

---

## 1. Conferência automatizada do upload do fornecedor

Você está certo: a maior parte da conferência é cruzamento de dados que a plataforma já tem, e máquina cruza dado melhor do que olho humano cansado. O desenho correto não é escolher entre automático e humano; é **automático por padrão, humano só na exceção**, com a máquina dizendo exatamente qual campo divergiu.

A estrutura já joga a favor: o fornecedor faz upload **dentro de um caso** (estudante já identificado) e com **tipo de documento obrigatório**. O erro que a conferência precisa pegar não é "documento perdido no sistema"; é "LOA da Maria Silva anexada no caso da Maria Souza" e "nome grafado errado que derruba visto". Ambos são verificáveis por máquina.

### Pipeline de validação

```
Upload do fornecedor (caso + tipo obrigatório)
        │
        ▼
1. EXTRAÇÃO: texto do PDF (camada de texto; OCR como
   fallback para documento escaneado)
        │
        ▼
2. CRUZAMENTOS contra o CRM do caso:
   ┌────────────────────────────┬──────────────────────────┐
   │ Verificação                │ Fonte de comparação      │
   ├────────────────────────────┼──────────────────────────┤
   │ Nome completo do estudante │ Cadastro (match tolerante│
   │ presente no documento      │ a acentos, ordem, caixa) │
   │ Data de nascimento         │ Cadastro (se constar)    │
   │ Data de início do programa │ Anexo I (tolerância ±7d, │
   │                            │ configurável)            │
   │ Nome do programa/curso     │ Anexo I (palavras-chave) │
   │ Nome da instituição        │ Fornecedor do caso       │
   │ Duração/semanas            │ Anexo I (se constar)     │
   └────────────────────────────┴──────────────────────────┘
        │
        ▼
3. VEREDITO:
   • Todas as verificações críticas OK
     → PUBLICA no cofre do cliente automaticamente
     → notifica o cliente + registro passivo para o time
     → CRM: LOA_Status = Recebida, Conferencia = "auto"
   • Qualquer divergência ou confiança baixa (OCR ruim,
     nome não encontrado)
     → FILA HUMANA, com o diff pronto na tela:
       "Nome no documento: 'Maria Silvia' | Cadastro:
        'Maria Silva'" — decisão em segundos, não minutos
     → aprovado → publica | devolvido → volta ao fornecedor
       com o motivo estruturado
```

### Regras de calibração

- **Verificações críticas** (nome do estudante, instituição): divergência sempre para a fila humana. **Verificações informativas** (duração, datas com tolerância): divergência publica com aviso interno, sem travar o cliente.
- Começar conservador (limiar de similaridade de nome alto) e afrouxar com dados reais. A meta honesta de regime: 80 a 90% dos uploads publicados sem toque humano, com o restante resolvido em segundos porque a máquina já apontou o campo divergente.
- Todo veredito automático fica logado com as evidências do match (o que encontrou, onde, com que confiança). Se um dia algo passar errado, a resposta é melhorar a regra, não voltar ao 100% manual.
- **Faseamento realista**: na onda 2 (modo link seguro, sem portal), a conferência nasce humana com o diff assistido quando houver camada de texto; o pipeline completo com OCR e auto-publicação entra na onda 3 junto com o portal. Assim a automação chega quando o volume justifica, sem bloquear o lançamento.

---

## 2. Pagamento às escolas — padrão D-30

Novo componente do motor financeiro: contas a pagar a fornecedores, com vencimento padrão de **30 dias antes do início do programa**, configurável por fornecedor e por caso.

### Por que configurável, e não fixo

O D-30 é um bom padrão de tesouraria, mas duas realidades do setor o quebram com frequência: escolas que **condicionam a emissão da LOA (ou da carta para o visto) a depósito ou pagamento antecipado**, e destinos cujo processo de visto exige comprovação de pagamento muito antes do embarque. Por isso o campo é `Fornecedor_Prazo_Pagamento` (padrão: `inicio - 30d`), com override no caso quando a regra da escola ou o calendário do visto exigirem. O motor obedece ao campo, não à regra fixa.

### Fluxo automatizado

```
LOA recebida + fatura do fornecedor no caso
        │
        ▼
D-45 do início: alerta de CÂMBIO
   "Pagamento de {escola} vence em 15 dias: {valor} {moeda}.
    Janela para contratar o câmbio."
   (a compra antecipada da moeda é decisão humana de
    tesouraria; o motor garante que ela nunca seja tomada
    em cima da hora)
        │
        ▼
D-37: tarefa "executar pagamento" com o pacote pronto:
   • Valor bruto do programa (Anexo I, moeda de origem)
   • (–) comissão da empresa conforme acordo com o fornecedor
   • (=) valor líquido a remeter
   • Conferência automática fatura × Anexo I:
     divergência de valor → flag para humano antes de pagar
        │
        ▼
D-30: vencimento. Pagamento executado (remessa) →
   registro no CRM/Books (Pagamento_Escola_Status = Pago)
   → COMPROVANTE compartilhado com o fornecedor pelo portal
     (gatilho automático, mesmo mecanismo da seção 4 da v1)
   → pendência encerrada no cockpit
        │
        ▼
D-30 sem pagamento executado: escalada para o gestor
   (pagamento atrasado a escola é risco direto sobre a vaga
    e sobre a relação comercial; nunca falha em silêncio)
```

### O que isso adiciona ao cockpit

Aba de contas a pagar: remessas dos próximos 60 dias por moeda (exposição cambial consolidada, insumo direto para a mesa de câmbio), pagamentos com fatura divergente aguardando decisão, e histórico por fornecedor. Campos novos no CRM: `Fornecedor_Prazo_Pagamento`, `Comissao_Percentual` (por fornecedor/acordo), `Pagamento_Escola_Valor_Liquido`, `Pagamento_Escola_Status`, `Data_Pagamento_Escola`.

Um detalhe que fecha o ciclo: a **fatura** já é um tipo da lista fechada de upload do fornecedor. Fatura que chega passa pelo mesmo pipeline de conferência da seção 1 (match de estudante, programa e valor contra o Anexo I menos comissão), e o pagamento só entra na fila de execução com fatura conferida. Contas a pagar sem fatura conferida é onde nascem os erros caros.

---

## 3. Ficha de matrícula bilíngue auto-preenchida

Princípio: **o cliente não redigita nada que a plataforma já sabe.** A ficha é gerada pelo backend como documento bilíngue (PT/EN em duas colunas ou campo duplo), pré-preenchida de três fontes, e o cliente só completa o que ninguém além dele pode saber, revisa e assina.

### Mapa de campos por fonte

| Bloco da ficha | Campos | Fonte (automática) |
|---|---|---|
| Programa contratado | Instituição, cidade/país, curso, carga horária, data de início, duração, acomodação contratada, serviços adicionais | **Deal / Anexo I** (o que foi comprado no checkout) |
| Identificação do estudante | Nome completo, data de nascimento, nacionalidade, CPF | **Cadastro** (checkout + complemento pós-pagamento) |
| Passaporte | Número, validade, país emissor | **Cofre**: extraídos do passaporte aprovado no motor de documentos (a mesma captura estruturada da validade já especificada na v3 alimenta a ficha) |
| Contato | E-mail, celular/WhatsApp, endereço completo | **Cadastro** |
| Responsável legal (se menor) | Nome, CPF, parentesco, contato | **Cadastro** (bloco condicional de menor) |
| Contato de emergência | Nome, relação, telefone | **Cliente preenche** (uma vez; fica no cadastro para as próximas) |
| Saúde e restrições | Alergias, condições médicas, medicamentos, restrições alimentares | **Cliente preenche** (dado sensível: coletado só aqui, com finalidade explícita "informar a instituição/homestay", base legal e retenção próprias) |
| Preferências de acomodação | Fumante, animais, crianças na casa, observações | **Cliente preenche** (quando acomodação contratada) |
| Assinaturas | Cliente/estudante; se menor: + responsável legal (+ testemunhas conforme o contrato-mestre) | **Zoho Sign / SignForms**, bloco multi-signatário montado pela mesma regra de idade do contrato |

### Fluxo de geração e assinatura

1. Entrada no estado 3 (Matrícula): backend faz o merge do template bilíngue com as três fontes e envia via SignForms; os campos que faltam (saúde, emergência, preferências) chegam como campos editáveis do próprio SignForms, então **preencher e assinar é um único ato**, na mesma tela.
2. Pré-condição de qualidade: a ficha só é gerada com **passaporte aprovado no cofre** (senão os campos de passaporte iriam em branco e a escola devolveria). Se o passaporte ainda não estiver aprovado, o motor inverte a ordem da pendência para o cliente: "envie seu passaporte para liberarmos sua ficha de matrícula". Isso ordena o estado 3 e o 4 sem criar estado novo.
3. Concluída a assinatura (webhook), o gatilho 1 da v1 segue inalterado: PDF final arquivado, compartilhado com o fornecedor, pendência de LOA aberta.
4. O template é **um por empresa** (padrão Forio, padrão EXP Tour), com o bloco de acomodação e o de saúde aparecendo condicionalmente. Se uma escola exigir formulário próprio dela além do padrão, ele entra como segundo SignForms no mesmo estado, com os mesmos dados injetados; a ficha padrão continua sendo o documento-mestre da empresa.

### Dois cuidados que valem o parágrafo

O bloco de **saúde** é dado pessoal sensível sob a LGPD: coleta com finalidade explícita, compartilhamento com o fornecedor limitado ao necessário (a homestay precisa saber da alergia a amendoim; não precisa do histórico médico), e retenção mais curta que a do resto do cadastro. E a **grafia dos nomes**: a ficha exibe em destaque "confira se o nome está exatamente como no passaporte", porque o dado vem do cadastro digitado no checkout, e a conferência automatizada da seção 1 vai comparar a LOA contra ele. Nome certo na origem economiza todo o ciclo de devolução.

---

## 4. Encaixe no roadmap

- **Onda 2**: ficha auto-preenchida com merge das três fontes (é pré-requisito do gatilho 1, que já está na onda 2); conferência humana assistida com diff; campos de pagamento a fornecedor criados no CRM e alertas D-45/D-37/D-30 na versão tarefa.
- **Onda 3**: pipeline completo de conferência automática (OCR + auto-publicação), portal do fornecedor, conferência automática de fatura, comprovante de pagamento compartilhado via portal.
- **Onda 4**: aba de contas a pagar com exposição cambial consolidada no cockpit e ranking de fornecedores incluindo tempo de LOA e taxa de devolução.

## 5. Próximos passos

1. Desenhar o template bilíngue da ficha (um por empresa) com os blocos condicionais e o mapa de campos desta especificação; validar com 2 ou 3 escolas de maior volume se o padrão substitui o formulário delas.
2. Levantar por fornecedor: prazo de pagamento real (D-30 serve? exige antecipado para LOA?), percentual de comissão e formato de fatura, alimentando os campos novos.
3. Definir os limiares iniciais da conferência automática (similaridade de nome, tolerância de datas) e o formato do log de evidências.
4. Incluir no acordo com fornecedores a regra do comprovante de pagamento via portal e a cláusula de dados sensíveis de saúde (complemento à cláusula LGPD da v1 do módulo).
