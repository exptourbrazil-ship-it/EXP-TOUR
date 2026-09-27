# Seed do Diagnóstico Forio — conteúdo para revisão (item 0.1)

Fonte do seed `supabase/seed-diagnostico.sql`. Tudo aqui é **dado**, não
código: Escada, famílias profissionais, situações com nível-alvo e as cinco
âncoras de cada situação com o nível interno que cada frase mapeia.

Convenções:
- Nível interno de 1 a 5, com meio degrau. O cliente nunca vê o número.
- As cinco âncoras seguem sempre a mesma curva: evito → faço só se puxado →
  faço com preparação → faço bem, perco sob pressão → faço com autonomia.
- A última âncora de cada situação está no **nível-alvo** da situação.
- A opção "Não tenho certeza" é acrescentada pelo sistema em toda pergunta;
  não entra no seed.
- Peso de frequência (hoje = 2, próximos 12 meses = 1) é regra do motor.

Marque na revisão: **[OK]**, **[TROCAR: texto]** ou **[CORTAR]** ao lado da linha.

---

## 1. A Escada Forio

| Nível | Nome | Como se reconhece no trabalho | CEFR aprox. (interno) |
|---|---|---|---|
| 1 | Sobrevivência | Lê o essencial, não acompanha conversa em tempo real, não participa | A1–A2 |
| 2 | Reativo | Responde quando perguntado, prepara falas com antecedência, evita call sem pauta | A2–B1 |
| 3 | Funcional | Participa de reunião e se faz entender; trava em negociação, apresentação e conflito | B1–B2 |
| 4 | Profissional | Conduz reunião e apresenta para audiência internacional; ainda perde nuance e velocidade em grupo | B2–C1 |
| 5 | Executivo | Negocia, influencia, lidera e discorda em inglês sem perder autoridade | C1–C2 |

Frase de venda do salto 3 → 4, para a devolutiva: "Você se faz entender. O
que falta é conduzir: reunião, apresentação e discussão rápida sem preparar
antes."

---

## 2. Famílias profissionais (seletor da pergunta de profissão)

| Slug | Nome exibido | Situações específicas |
|---|---|---|
| tecnologia | Tecnologia e dados | 5 |
| juridico | Jurídico e compliance | 5 |
| saude | Saúde | 5 |
| comercial | Comercial e vendas | 5 |
| lideranca | Liderança e gestão | 4 |
| financas | Finanças e contabilidade | 4 |
| engenharia | Engenharia, indústria e operações | 4 |
| marketing | Marketing, produto e comunicação | 4 |
| rh | RH e pessoas | 4 |
| educacao | Educação e pesquisa | 4 |
| empreendedor | Empreendedor e founder | 4 |
| outra | Outra área | 0 (só o núcleo comum + texto livre) |

Toda família recebe o núcleo comum. A conversa mostra no máximo 8 situações:
as específicas da família mais as do núcleo até completar 8, na ordem abaixo.

---

## 3. Núcleo comum (toda profissão)

### 3.1 Reunião com time internacional — alvo 4

| Âncora exibida | Nível |
|---|---|
| Entro na call e praticamente não falo | 1 |
| Falo só quando me perguntam diretamente | 2 |
| Participo, mas preciso preparar o que vou dizer antes | 3 |
| Participo naturalmente, travo quando vira discussão rápida | 3,5 |
| Conduzo a reunião sem esforço | 4 |

### 3.2 Call com várias pessoas e sotaques diferentes — alvo 4

| Âncora exibida | Nível |
|---|---|
| Perco o fio logo no início e fico só ouvindo | 1 |
| Entendo um ou dois, os outros me escapam | 2 |
| Acompanho se a call tiver pauta e ritmo controlado | 3 |
| Acompanho bem, mas peço para repetir quando falam rápido ou por cima | 3,5 |
| Acompanho todos e intervenho na hora certa | 4 |

### 3.3 Apresentar para audiência internacional — alvo 4

| Âncora exibida | Nível |
|---|---|
| Não apresento, peço para outra pessoa | 1,5 |
| Apresento lendo o que escrevi | 2 |
| Apresento com script decorado, travo nas perguntas | 3 |
| Apresento bem, sofro no Q&A | 3,5 |
| Apresento e conduzo o Q&A sem esforço | 4 |

### 3.4 Escrever e-mail sem soar rude nem infantil — alvo 3

| Âncora exibida | Nível |
|---|---|
| Uso tradutor para tudo e mando sem revisar | 1 |
| Escrevo frases curtas e simples, tenho medo de parecer grosseiro | 2 |
| Escrevo bem, mas demoro e reviso várias vezes | 2,5 |
| Escrevo com naturalidade, erro o tom em assunto delicado | 3 |
| Ajusto o tom para cada pessoa sem pensar nisso | 3,5 |

### 3.5 Discordar e defender posição — alvo 5

| Âncora exibida | Nível |
|---|---|
| Concordo em inglês com o que eu discordaria em português | 1,5 |
| Sinalizo que discordo, mas não consigo explicar por quê | 2,5 |
| Explico minha posição, mas perco o argumento quando rebatem | 3 |
| Defendo bem, mas soo mais duro ou mais fraco do que queria | 4 |
| Discordo com firmeza e sem perder o tom | 5 |

### 3.6 Conversa informal e construção de relacionamento — alvo 3

| Âncora exibida | Nível |
|---|---|
| Evito o café e o almoço com estrangeiros | 1 |
| Respondo perguntas sobre mim, não consigo puxar assunto | 2 |
| Converso sobre trabalho, travo em assunto pessoal ou humor | 2,5 |
| Converso à vontade, perco piadas e referências | 3 |
| Crio relação em qualquer contexto, com humor | 3,5 |

### 3.7 Entrevista de emprego ou processo seletivo internacional — alvo 4

| Âncora exibida | Nível |
|---|---|
| Não me candidato a vaga que exige entrevista em inglês | 1 |
| Decoro respostas para as perguntas mais comuns | 2 |
| Respondo bem ao previsível, travo na pergunta inesperada | 3 |
| Vou bem na entrevista, perco em dinâmica de grupo ou case | 3,5 |
| Entrevista em inglês não me tira o sono | 4 |

### 3.8 Entender áudio rápido sem legenda (vídeo, voz, podcast) — alvo 3

| Âncora exibida | Nível |
|---|---|
| Só entendo com legenda | 1 |
| Entendo o assunto geral, perco os detalhes | 2 |
| Entendo bem em velocidade normal, perco em sotaque ou gíria | 2,5 |
| Entendo quase tudo, preciso de atenção total | 3 |
| Ouço em segundo plano e entendo | 3,5 |

### 3.9 Negociar preço, prazo ou contrato — alvo 5

| Âncora exibida | Nível |
|---|---|
| Evito, passo para outra pessoa | 1,5 |
| Consigo apresentar números, não consigo argumentar contra | 2,5 |
| Negocio, mas perco força quando preciso discordar | 3 |
| Negocio com naturalidade, perco nuance em situação tensa | 4 |
| Negocio e influencio sem perder autoridade | 5 |

---

## 4. Tecnologia e dados

### 4.1 Daily e cerimônias ágeis em inglês — alvo 3

| Âncora exibida | Nível |
|---|---|
| Digo "no blockers" e pronto | 1 |
| Reporto o que fiz com frases prontas | 2 |
| Reporto e tiro dúvidas, travo quando a discussão sai do script | 3 |
| Participo da retro e do planning, perco em debate acalorado | 3,5 |
| Facilito a cerimônia se precisar | 4 |

### 4.2 Code review e discussão técnica escrita — alvo 3

| Âncora exibida | Nível |
|---|---|
| Aprovo sem comentar para não ter que escrever | 1 |
| Comento com frases curtas, evito explicar o porquê | 2 |
| Explico o problema, demoro para achar o tom entre direto e educado | 3 |
| Escrevo review completo, às vezes soo mais seco do que queria | 3,5 |
| Discuto trade-off por escrito com clareza e tato | 4 |

### 4.3 Explicar decisão de arquitetura para stakeholder estrangeiro — alvo 4

| Âncora exibida | Nível |
|---|---|
| Peço para o tech lead ou o gerente falar por mim | 1,5 |
| Mostro o diagrama e deixo o desenho falar | 2 |
| Explico com preparação, travo quando questionam o custo ou o risco | 3 |
| Explico bem, perco quando o stakeholder não é técnico | 3,5 |
| Traduzo decisão técnica em impacto de negócio, para qualquer público | 4 |

### 4.4 Documentação técnica (RFC, ADR, README) — alvo 3

| Âncora exibida | Nível |
|---|---|
| Escrevo em português e traduzo com ferramenta | 1 |
| Escrevo tópicos, não consigo redigir o raciocínio | 2 |
| Escrevo, mas o texto fica confuso ou repetitivo | 2,5 |
| Escrevo com clareza, demoro mais que em português | 3 |
| Escrevo RFC que o time global lê sem perguntar nada | 3,5 |

### 4.5 Entrevista técnica internacional — alvo 4

| Âncora exibida | Nível |
|---|---|
| Não me candidato a empresa que entrevista em inglês | 1 |
| Resolvo o problema, não consigo explicar o raciocínio em voz alta | 2 |
| Explico o raciocínio com esforço, perco tempo no código | 3 |
| Vou bem no técnico, sofro no system design e no behavioral | 3,5 |
| Passo em entrevista de big tech pelo inglês, não apesar dele | 4 |

---

## 5. Jurídico e compliance

### 5.1 Ler e interpretar contrato em inglês — alvo 3

| Âncora exibida | Nível |
|---|---|
| Mando traduzir antes de ler | 1 |
| Leio com dicionário, demoro dias | 2 |
| Leio e entendo, insegurança em cláusula longa ou termo de common law | 2,5 |
| Leio com segurança, confirmo um ou outro termo | 3 |
| Leio contrato em inglês como leio em português | 3,5 |

### 5.2 Redigir cláusula ou parecer — alvo 4

| Âncora exibida | Nível |
|---|---|
| Redijo em português e peço tradução juramentada | 1,5 |
| Adapto modelo pronto, não crio texto novo | 2 |
| Redijo, mas o texto sai com estrutura de português | 3 |
| Redijo bem, revisão de nativo ainda muda o tom | 3,5 |
| Redijo cláusula que o escritório correspondente aceita sem ajuste | 4 |

### 5.3 Negociar termos com contraparte estrangeira — alvo 5

| Âncora exibida | Nível |
|---|---|
| Delego a negociação e só reviso o resultado | 1,5 |
| Apresento nossa posição, não consigo rebater a deles | 2,5 |
| Negocio, cedo mais do que deveria por falta de argumento rápido | 3 |
| Negocio bem, perco precisão em cláusula sensível sob pressão | 4 |
| Negocio termo a termo e mantenho a posição sem atrito | 5 |

### 5.4 Conference call com escritório correspondente — alvo 4

| Âncora exibida | Nível |
|---|---|
| Deixo um sócio ou associado conduzir | 1,5 |
| Acompanho e respondo o que me perguntam | 2 |
| Participo com pauta preparada, travo em questão nova | 3 |
| Conduzo, perco velocidade quando vários falam | 3,5 |
| Conduzo a call e fecho os próximos passos | 4 |

### 5.5 Vocabulário jurídico de common law — alvo 3

| Âncora exibida | Nível |
|---|---|
| Não conheço os termos além do básico | 1 |
| Reconheço os termos, não sei o efeito de cada um | 2 |
| Conheço os principais, confundo os parecidos | 2,5 |
| Uso com segurança em texto, hesito em fala | 3 |
| Uso e explico a diferença para o direito brasileiro | 3,5 |

---

## 6. Saúde

### 6.1 Vocabulário clínico e anamnese — alvo 3

| Âncora exibida | Nível |
|---|---|
| Só sei os termos que são iguais em português | 1 |
| Sei os termos, não consigo montar a pergunta | 2 |
| Faço anamnese básica com roteiro | 2,5 |
| Faço anamnese completa, hesito em termo raro | 3 |
| Faço anamnese em inglês sem pensar nas palavras | 3,5 |

### 6.2 Comunicação com paciente e família — alvo 4

| Âncora exibida | Nível |
|---|---|
| Evito atender paciente estrangeiro | 1 |
| Atendo com frases prontas e gestos | 2 |
| Explico diagnóstico simples, travo em notícia difícil | 3 |
| Comunico bem, perco nuance em conversa emocional | 3,5 |
| Dou notícia difícil com empatia e clareza | 4 |

### 6.3 Apresentação de caso e discussão com equipe — alvo 4

| Âncora exibida | Nível |
|---|---|
| Não apresento caso em inglês | 1,5 |
| Apresento lendo os slides | 2 |
| Apresento com preparação, travo na discussão | 3 |
| Apresento bem, sofro quando questionam a conduta | 3,5 |
| Apresento e defendo a conduta na discussão | 4 |

### 6.4 Ler e discutir literatura científica — alvo 3

| Âncora exibida | Nível |
|---|---|
| Leio só o abstract traduzido | 1 |
| Leio o artigo com esforço, não discuto | 2 |
| Leio e entendo, discuto com dificuldade | 2,5 |
| Leio com fluência, discuto com preparação | 3 |
| Leio e discuto artigo em journal club sem preparar | 3,5 |

### 6.5 Exame de proficiência para validação ou registro (OET, IELTS) — alvo 4

| Âncora exibida | Nível |
|---|---|
| Nunca tentei, sei que não passaria | 1 |
| Fiz simulado, fiquei longe da nota | 2 |
| Passo em leitura e escuta, reprovo em fala ou escrita | 3 |
| Chego perto da nota, falta consistência | 3,5 |
| Já tenho a nota ou passaria hoje | 4 |

---

## 7. Comercial e vendas

### 7.1 Pitch e apresentação de proposta — alvo 4

| Âncora exibida | Nível |
|---|---|
| Mando a proposta por e-mail para não apresentar | 1,5 |
| Apresento lendo os slides | 2 |
| Apresento com script, travo na objeção | 3 |
| Apresento bem, perco força na hora de fechar | 3,5 |
| Apresento, contorno objeção e fecho | 4 |

### 7.2 Negociação comercial — alvo 5

| Âncora exibida | Nível |
|---|---|
| Passo a negociação para alguém do time | 1,5 |
| Apresento preço e condição, não argumento | 2,5 |
| Negocio, cedo desconto por não saber rebater | 3 |
| Negocio bem, perco nuance quando a conversa esquenta | 4 |
| Negocio e fecho mantendo margem e relação | 5 |

### 7.3 Relacionamento e follow-up com cliente estrangeiro — alvo 3

| Âncora exibida | Nível |
|---|---|
| Só me comunico por e-mail traduzido | 1 |
| Faço follow-up com template, evito ligação | 2 |
| Ligo e converso, fico só no assunto do negócio | 2,5 |
| Mantenho relação, perco em conversa informal | 3 |
| Cliente estrangeiro me trata como o vendedor de confiança | 3,5 |

### 7.4 Feedback e conversa difícil com o time — alvo 5

| Âncora exibida | Nível |
|---|---|
| Adio a conversa até alguém fazer por mim | 1,5 |
| Dou feedback genérico para não errar a palavra | 2,5 |
| Dou feedback direto, soo mais duro do que queria | 3 |
| Conduzo bem, perco quando a pessoa reage mal | 4 |
| Conduzo conversa difícil com firmeza e cuidado | 5 |

### 7.5 Representar a empresa em evento ou feira internacional — alvo 4

| Âncora exibida | Nível |
|---|---|
| Fico no estande e chamo alguém quando aparece estrangeiro | 1 |
| Explico o produto com frases prontas | 2 |
| Converso sobre o produto, travo em pergunta técnica ou comercial | 3 |
| Converso bem, perco em networking e aproximação | 3,5 |
| Saio da feira com contatos que viram negócio | 4 |

---

## 8. Liderança e gestão

### 8.1 Reunião de resultado com matriz ou board — alvo 4

| Âncora exibida | Nível |
|---|---|
| Meu par ou meu chefe apresenta por mim | 1,5 |
| Apresento os números lendo | 2 |
| Apresento com preparação, travo na pergunta sobre o desvio | 3 |
| Apresento bem, perco em pressão de diretor | 3,5 |
| Apresento resultado ruim mantendo a confiança da sala | 4 |

### 8.2 Feedback e conversa difícil com liderado estrangeiro — alvo 5

| Âncora exibida | Nível |
|---|---|
| Evito ter liderado que não fala português | 1,5 |
| Dou feedback por escrito para não errar | 2,5 |
| Dou feedback ao vivo, soo frio ou duro demais | 3 |
| Conduzo bem, perco quando a pessoa contesta | 4 |
| Conduzo demissão ou promoção em inglês com naturalidade | 5 |

### 8.3 Alinhar prioridades com par estrangeiro — alvo 4

| Âncora exibida | Nível |
|---|---|
| Aceito a prioridade que o outro define | 1,5 |
| Explico minha prioridade, não consigo negociar a dele | 2,5 |
| Alinho com preparação, cedo quando o outro insiste | 3 |
| Alinho bem, perco nuance em conflito de agenda | 3,5 |
| Negocio prioridade de igual para igual | 4 |

### 8.4 Representar a empresa em evento ou visita internacional — alvo 4

| Âncora exibida | Nível |
|---|---|
| Delego a representação | 1,5 |
| Vou, mas fico no protocolo | 2 |
| Converso sobre a empresa, travo em pergunta estratégica | 3 |
| Converso bem, perco em improviso e discurso | 3,5 |
| Falo pela empresa em qualquer sala | 4 |

---

## 9. Finanças e contabilidade

### 9.1 Explicar resultado e variação para a matriz — alvo 4

| Âncora exibida | Nível |
|---|---|
| Mando a planilha e deixo o controller explicar | 1,5 |
| Explico os números com frases prontas | 2 |
| Explico com preparação, travo na pergunta sobre a causa | 3 |
| Explico bem, perco em pergunta cruzada de CFO | 3,5 |
| Explico variação e defendo a projeção | 4 |

### 9.2 Call de auditoria ou due diligence — alvo 4

| Âncora exibida | Nível |
|---|---|
| Respondo só por escrito e com atraso | 1,5 |
| Respondo o que perguntam, não antecipo nada | 2 |
| Participo com preparação, travo em pergunta fora da lista | 3 |
| Participo bem, perco velocidade em ponto contestado | 3,5 |
| Conduzo a call de auditoria pelo nosso lado | 4 |

### 9.3 Ler norma, relatório e contrato financeiro em inglês — alvo 3

| Âncora exibida | Nível |
|---|---|
| Espero a versão traduzida | 1 |
| Leio com dicionário e demoro | 2 |
| Leio e entendo, insegurança em termo técnico | 2,5 |
| Leio com segurança, confirmo um ou outro termo | 3 |
| Leio IFRS ou relatório de analista sem esforço | 3,5 |

### 9.4 Defender orçamento ou provisão — alvo 5

| Âncora exibida | Nível |
|---|---|
| Aceito o corte para não discutir | 1,5 |
| Apresento o pedido, não consigo rebater o corte | 2,5 |
| Defendo, cedo quando a pressão sobe | 3 |
| Defendo bem, perco precisão sob pressão | 4 |
| Defendo o orçamento e saio com ele aprovado | 5 |

---

## 10. Engenharia, indústria e operações

### 10.1 Reunião técnica com fornecedor ou matriz — alvo 4

| Âncora exibida | Nível |
|---|---|
| Deixo o engenheiro que fala inglês conduzir | 1,5 |
| Respondo o que perguntam com termos técnicos | 2 |
| Participo com preparação, travo em problema novo | 3 |
| Participo bem, perco em discussão rápida de causa raiz | 3,5 |
| Conduzo a reunião técnica | 4 |

### 10.2 Ler especificação, norma e manual — alvo 3

| Âncora exibida | Nível |
|---|---|
| Uso tradutor e confio nele | 1 |
| Leio com dicionário, demoro | 2 |
| Leio e entendo, insegurança em termo específico | 2,5 |
| Leio com segurança | 3 |
| Leio norma em inglês como em português | 3,5 |

### 10.3 Auditoria ou visita de planta com estrangeiro — alvo 4

| Âncora exibida | Nível |
|---|---|
| Fico no fundo e deixo o gerente falar | 1,5 |
| Mostro a linha e respondo o básico | 2 |
| Apresento a operação, travo em pergunta de não conformidade | 3 |
| Apresento bem, perco em pergunta difícil do auditor | 3,5 |
| Conduzo a visita e respondo qualquer questão | 4 |

### 10.4 Reportar incidente e plano de ação — alvo 4

| Âncora exibida | Nível |
|---|---|
| Reporto por escrito e traduzido | 1,5 |
| Reporto o fato, não consigo explicar a causa | 2 |
| Reporto com preparação, travo quando questionam a ação | 3 |
| Reporto bem, perco firmeza sob cobrança | 3,5 |
| Reporto incidente grave com clareza e mantenho a confiança | 4 |

---

## 11. Marketing, produto e comunicação

### 11.1 Apresentar estratégia ou roadmap — alvo 4

| Âncora exibida | Nível |
|---|---|
| Mando o deck e evito apresentar | 1,5 |
| Apresento lendo os slides | 2 |
| Apresento com script, travo na pergunta de priorização | 3 |
| Apresento bem, perco quando contestam a estratégia | 3,5 |
| Apresento e defendo o roadmap | 4 |

### 11.2 Alinhar com agência, parceiro ou time global — alvo 4

| Âncora exibida | Nível |
|---|---|
| Alinho só por e-mail | 1,5 |
| Alinho o básico, evito call | 2 |
| Faço a call com pauta, travo em imprevisto | 3 |
| Alinho bem, perco em discussão de prazo ou verba | 3,5 |
| Conduzo o alinhamento e fecho decisão | 4 |

### 11.3 Escrever briefing, copy ou texto em inglês — alvo 3

| Âncora exibida | Nível |
|---|---|
| Escrevo em português e traduzo | 1 |
| Escrevo simples, sem o tom da marca | 2 |
| Escrevo, mas o texto soa traduzido | 2,5 |
| Escrevo bem, revisão de nativo ainda ajusta | 3 |
| Escrevo copy que nativo aprova | 3,5 |

### 11.4 Discutir métricas e defender prioridade — alvo 5

| Âncora exibida | Nível |
|---|---|
| Aceito a prioridade do outro | 1,5 |
| Mostro os dados, não consigo argumentar | 2,5 |
| Defendo, cedo quando insistem | 3 |
| Defendo bem, perco nuance em conflito | 4 |
| Defendo prioridade com dado e mantenho a posição | 5 |

---

## 12. RH e pessoas

### 12.1 Entrevistar candidato em inglês — alvo 4

| Âncora exibida | Nível |
|---|---|
| Peço para outra pessoa entrevistar | 1,5 |
| Faço as perguntas do roteiro, não aprofundo | 2 |
| Entrevisto com roteiro, travo em pergunta de follow-up | 3 |
| Entrevisto bem, perco nuance na avaliação de fit | 3,5 |
| Conduzo entrevista e avalio com segurança | 4 |

### 12.2 Conduzir onboarding ou treinamento — alvo 4

| Âncora exibida | Nível |
|---|---|
| Mando o material e não conduzo | 1,5 |
| Conduzo lendo os slides | 2 |
| Conduzo com preparação, travo nas perguntas | 3 |
| Conduzo bem, perco em dinâmica de grupo | 3,5 |
| Conduzo treinamento com energia e improviso | 4 |

### 12.3 Conversa sensível com colaborador estrangeiro — alvo 5

| Âncora exibida | Nível |
|---|---|
| Evito, envolvo o gestor ou o jurídico | 1,5 |
| Conduzo por escrito para não errar | 2,5 |
| Conduzo ao vivo, soo fria ou dura demais | 3 |
| Conduzo bem, perco quando a pessoa se emociona ou contesta | 4 |
| Conduzo desligamento, assédio ou saúde mental com segurança | 5 |

### 12.4 Ler e explicar política global — alvo 3

| Âncora exibida | Nível |
|---|---|
| Espero a tradução | 1 |
| Leio com esforço, explico só o básico | 2 |
| Leio e entendo, insegurança para explicar exceção | 2,5 |
| Leio com segurança e explico | 3 |
| Explico política global a qualquer público | 3,5 |

---

## 13. Educação e pesquisa

### 13.1 Apresentar trabalho em congresso — alvo 4

| Âncora exibida | Nível |
|---|---|
| Submeto pôster para não apresentar | 1,5 |
| Apresento lendo | 2 |
| Apresento decorado, travo nas perguntas | 3 |
| Apresento bem, sofro no Q&A | 3,5 |
| Apresento e conduzo o Q&A | 4 |

### 13.2 Escrever artigo ou abstract — alvo 3

| Âncora exibida | Nível |
|---|---|
| Escrevo em português e pago tradução | 1 |
| Escrevo, mas o revisor devolve por inglês | 2 |
| Escrevo, o texto soa traduzido | 2,5 |
| Escrevo bem, edição de nativo ainda ajusta | 3 |
| Escrevo artigo que passa sem comentário de idioma | 3,5 |

### 13.3 Dar aula ou orientar em inglês — alvo 4

| Âncora exibida | Nível |
|---|---|
| Não aceito turma ou orientando em inglês | 1,5 |
| Dou aula lendo, evito pergunta | 2 |
| Dou aula com preparação, travo em dúvida inesperada | 3 |
| Dou aula bem, perco em discussão aberta | 3,5 |
| Dou aula e oriento em inglês com naturalidade | 4 |

### 13.4 Participar de banca, painel ou revisão por pares — alvo 5

| Âncora exibida | Nível |
|---|---|
| Recuso convite em inglês | 1,5 |
| Participo, faço só perguntas preparadas | 2,5 |
| Participo, perco quando o debate acelera | 3 |
| Participo bem, perco nuance ao discordar | 4 |
| Discordo de um par em inglês sem perder o respeito da sala | 5 |

---

## 14. Empreendedor e founder

### 14.1 Pitch para investidor ou cliente estrangeiro — alvo 4

| Âncora exibida | Nível |
|---|---|
| Mando o deck e evito a call | 1,5 |
| Apresento decorado | 2 |
| Apresento bem, travo nas perguntas | 3 |
| Apresento bem, sofro na pergunta sobre número ou risco | 3,5 |
| Apresento e conduzo a conversa depois do pitch | 4 |

### 14.2 Negociar com fornecedor, parceiro ou investidor — alvo 5

| Âncora exibida | Nível |
|---|---|
| Delego a negociação | 1,5 |
| Apresento a proposta, não consigo rebater | 2,5 |
| Negocio, cedo por falta de argumento rápido | 3 |
| Negocio bem, perco nuance em term sheet ou contrato | 4 |
| Negocio e fecho mantendo o que importa | 5 |

### 14.3 Atender cliente ou usuário estrangeiro — alvo 4

| Âncora exibida | Nível |
|---|---|
| Atendo só por e-mail traduzido | 1 |
| Atendo com frases prontas | 2 |
| Atendo bem, travo em reclamação | 3 |
| Atendo bem, perco em cliente irritado | 3,5 |
| Atendo qualquer cliente e viro reclamação em fidelidade | 4 |

### 14.4 Construir rede em evento internacional — alvo 3

| Âncora exibida | Nível |
|---|---|
| Vou ao evento e não falo com ninguém | 1 |
| Falo se alguém me aborda | 2 |
| Abordo pessoas, travo em conversa informal | 2,5 |
| Faço networking, perco em humor e referências | 3 |
| Saio de qualquer evento com contatos | 3,5 |

---

## 15. Perguntas do caminho mínimo (textos das telas)

| Ordem | Slug | Pergunta | Tipo |
|---|---|---|---|
| 0 | intencao | O que te trouxe até aqui? | aberta curta, salva literal |
| 1 | semanas | Quanto tempo você conseguiria ficar fora? | 2 sem · 3–4 sem · 5–8 sem · 9–12 sem · mais de 12 |
| 2 | periodo | Quando? | próximos 3 meses · 3–6 meses · 6–12 meses · ainda não sei |
| 3 | vinculo | Hoje você está… | empregado · entre empregos · autônomo · sócio |
| 4 | familia | Em que área você atua? | seletor de famílias (Seção 2) |
| 5 | situacoes | Quais destas situações acontecem no seu trabalho hoje, ou vão acontecer nos próximos 12 meses? | múltipla, com chip "hoje" / "em 12 meses" |
| 6–9 | ancora_* | Nessa situação, o que acontece hoje? | 5 âncoras, até 4 situações "hoje" |
| 10 | situacao_recente | Me conta uma situação recente em que o inglês te atrapalhou. | aberta, pode pular |

Perguntas 1 a 3 formam a Fase 1 (janela). A devolutiva parcial vem depois da
5; a completa depois das âncoras. Bloco C (orçamento, pagador, destino,
restrições) é aprofundamento após a devolutiva.

Contrato da primeira mensagem: "São cinco perguntas rápidas e eu te devolvo
uma leitura do seu nível e do que está te travando. Se quiser, depois a gente
aprofunda."
