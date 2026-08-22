# Arquitetura de Experiência — Área do Cliente
## UX do pós-venda completo + serviços integrados (câmbio, visto, passagem), sobre a marca EXP Tour

Complementa a arquitetura-mestre v4 no plano da experiência: como o cliente vê, navega e entende tudo o que o motor automatiza. Vale para as duas instâncias (tokens de marca por tenant). Referências fixas da marca EXP Tour: verde #042f1b, dourado #c9a35e, creme #f5ead9, serifada Bellefair para títulos.

---

## 1. Os cinco princípios de UX (o contrato da interface)

1. **Uma próxima ação por vez.** Em qualquer momento, a home responde: "o que eu preciso fazer agora?" com UM call to action dominante. Pendências secundárias existem, mas nunca competem visualmente. Cliente de intercâmbio está ansioso por natureza; interface que lista dez coisas ao mesmo tempo multiplica a ansiedade que o produto existe para reduzir.
2. **De quem é a bola, sempre visível.** Todo item em andamento declara "aguardando você" (dourado) ou "estamos cuidando disso" (verde, com o prazo esperado). É a informação que mais reduz mensagem no WhatsApp.
3. **Zero jargão, tudo explicado no lugar.** "LOA" vira "Carta de aceite da escola" com um ícone de info que explica em uma frase para que serve. A memória de cálculo cambial aparece onde o valor aparece. Nenhum termo do setor sem tradução.
4. **A automação é invisível; o efeito dela é celebrado.** O cliente não vê webhooks; vê "Sua carta de aceite chegou! 🎉" no momento em que chegou. Toda mudança de estado relevante tem seu momento na interface (e no e-mail), com tom caloroso nos marcos felizes.
5. **Progressive disclosure.** Cada tela mostra o essencial e esconde o detalhe atrás de um toque (memória de cálculo, histórico de repactuações, documentos antigos). Denso por dentro, limpo por fora.

## 2. Navegação: as 5 abas do BottomNav (evoluindo o existente)

| Aba | Conteúdo | Comportamento adaptativo |
|---|---|---|
| **Início** | Contagem regressiva, jornada visual, próxima ação, celebrações, atalhos de serviços | O coração; muda com a fase |
| **Financeiro** | Parcelas, pagar/antecipar, ajustar plano (editor com marcos), recibos, memória cambial | Após quitação, vira histórico + recibos |
| **Documentos** | Cofre nas 3 categorias, upload guiado, status de análise | Badge com pendências |
| **Viagem** | Muda de pele por fase: Checklist (pré-embarque) → Guia de chegada + contatos (durante) → Certificado, avaliação, próxima viagem (retorno) | Uma aba, três vidas; substitui as três abas desabilitadas por uma só que acompanha o momento |
| **Ajuda** | FAQ por fase, falar com a EXP Tour (canal com SLA declarado), ocorrências, dados da conta e privacidade | Perfil e LGPD moram aqui |

Racional da aba Viagem única e adaptativa: três abas fixas (Embarque/Viagem/Retorno) significam duas abas mortas em qualquer momento da jornada. Uma aba que acompanha a fase mantém a navegação sempre 100% viva e ensina o cliente que "Viagem" é onde a fase atual acontece.

## 3. A Home por fase (o roteiro da tela principal)

Estrutura fixa: **(a)** cabeçalho com nome + programa + contagem regressiva (já existe), **(b)** régua da jornada (8 passos, com o atual pulsando), **(c)** card da PRÓXIMA AÇÃO, **(d)** o que está em andamento conosco, **(e)** serviços para sua viagem (seção 4), **(f)** celebração/última novidade.

Exemplos do card (c) por fase: "Assine seu contrato" (pós-entrada) → "Envie seu passaporte para liberarmos sua matrícula" (documentação) → "Complete e assine sua ficha de matrícula" → "Acompanhe: sua carta de aceite está com a escola (previsão: 5 dias úteis)" (bola com eles, sem botão) → "Prepare seu visto" → "Seu checklist de embarque: 7 de 12 itens" → "Como foi sua chegada?" (D+3) → "Seu certificado chegou: conte como foi!" (retorno).

## 4. Os serviços integrados (câmbio, visto, passagem): dois lugares, uma regra

**Lugar 1 — Oferta contextual (o momento certo, uma vez):** o serviço aparece como parte natural da próxima ação da fase, conforme a arquitetura: assessoria de visto no topo do guia do visto ("Prefere que um especialista cuide de tudo?"), passagem aérea logo após o visto aprovado (nunca antes, e a interface explica o porquê: "agora que seu visto saiu, é seguro comprar"), câmbio no pré-embarque (item do checklist "moeda para a viagem") e no Financeiro. Sempre com o "já resolvi isso" que marca o item e silencia a oferta.

**Lugar 2 — Seção permanente "Serviços para sua viagem" na Home:** três cartões fixos e discretos (Comprar moeda · Assessoria de visto · Passagem aérea), sempre encontráveis para quem procura, cada um abrindo uma página interna que explica o serviço, declara a parceria ("serviço prestado por parceiro; podemos receber comissão") e tem o botão de ação: link rastreado (`ref=EXP-{id}`) ou "quero ser contatado" com consentimento LGPD explícito registrado no clique. Estado inteligente: o cartão de passagem fica com aviso "disponível após a aprovação do visto" enquanto não for o momento, transformando a restrição em orientação.

Regra de ouro mantida da arquitetura: **oferta contextual aparece uma vez por momento; a seção permanente nunca insiste.** Conversão em serviço vem da confiança, e confiança não sobrevive a banner repetido.

## 5. Linguagem visual (grafia da marca aplicada)

- **Fundo creme (#f5ead9) como respiro; cartões brancos; verde (#042f1b) para estrutura, títulos e o estado "concluído/conosco"; dourado (#c9a35e) exclusivamente para a próxima ação e o estado "aguardando você"**. O dourado escasso é o que faz o olho encontrar a ação em um segundo.
- Bellefair nos títulos (a elegância da marca), sans legível no corpo e nos números (valores e datas nunca em serifada decorativa).
- A régua da jornada é o elemento-assinatura: 8 pontos, concluídos em verde preenchido, atual em dourado pulsante, futuros em contorno; a mesma régua aparece em miniatura nos e-mails.
- Estados sempre com ícone + cor + texto (nunca só cor: acessibilidade e clareza), toque mínimo de 44px, contraste AA no creme/verde, dark mode fora do escopo inicial (a marca vive no claro).
- Celebrações com moderação e intenção: chegada da LOA, quitação, visto aprovado, certificado. Quatro momentos de confete; o resto é sobriedade elegante.

## 6. Automação refletida na interface (o que o cliente percebe)

- **Tempo real percebido**: pagamento PIX confirma na tela em segundos (webhook → revalidação da página), documento aprovado atualiza o cofre e o checklist juntos, sem refresh manual.
- **Notificação e portal sempre coerentes**: todo e-mail/WhatsApp aponta para a tela que resolve; a tela nunca contradiz a mensagem (mesma fonte de eventos).
- **Prazos declarados são promessas do motor**: "análise em até 2 dias úteis" aparece porque o SLA interno existe e é monitorado; a interface nunca promete o que a Fila do Dia não cobra.
- **Nada pede duas vezes**: dado informado (ou documento aprovado) preenche tudo que o reutiliza (ficha, checklist, próxima viagem).

## 7. Entregáveis de design na sequência

1. Mockup da Home por fase (o primeiro está a seguir na conversa) e da aba Viagem nas três vidas.
2. Páginas internas dos três serviços com os textos de parceria e consentimento.
3. Biblioteca de componentes (cards de ação, régua, estados, celebração) para o Claude Code implementar com os tokens Tailwind da marca já configurados no repositório.
