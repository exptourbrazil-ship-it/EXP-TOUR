# Briefing para o contador / tributarista
## Estruturação fiscal da operação de intercâmbio (EXP Tour) e do marketplace (Forio) — perguntas fechadas

**Objetivo da reunião**: sair com as definições que viram parâmetros do sistema de emissão automática de NFS-e e da estrutura contratual. As respostas alimentam diretamente o contrato-mestre, o Termo de Adesão, o motor financeiro e a integração de notas. Não buscamos um parecer genérico; buscamos decisões.

---

## 1. Resumo do modelo operacional (contexto para o contador)

- A EXP Tour comercializa programas de intercâmbio (cursos no exterior + serviços associados). O cliente paga **em reais**, em parcelas via PIX, com o valor derivado do preço na moeda estrangeira pela fórmula: cotação BACEN Turismo Venda + IOF 3,5% + **taxa de serviço de 6,6%**.
- Do valor recebido, a maior parte é **repassada à instituição de ensino no exterior** (remessa internacional, tipicamente 30 dias antes do início do programa, valor bruto menos a comissão acordada com a escola). A remuneração da empresa é a **comissão da escola + a taxa de serviço de 6,6% + receitas ancilares** (indicação de câmbio, seguro, assessoria de visto por parceiros).
- Tíquete médio por contrato: R$ 40 mil a R$ 120 mil (valor cheio). A margem real (comissão + taxa) fica muito abaixo do valor cheio.
- Toda a operação é automatizada por eventos (pagamento confirmado dispara ações); a emissão de nota precisa ser automática e parametrizada, por isso as perguntas abaixo pedem respostas objetivas.
- **Intenção declarada**: operar como **intermediadora**, com receita bruta = comissão + taxas de serviço, e os valores de repasse às escolas tratados como valores de terceiros em trânsito. Queremos saber o que é necessário para essa estrutura ser sólida, ou, se o contador entender que não é viável, qual a alternativa e seu custo.
- Existe uma segunda empresa, **Forio**, marketplace digital que conecta agências/instituições a clientes finais; a Forio não vende o programa, remunera-se por take rate/comissão sobre as vendas dos vendedores da plataforma. Tratada no bloco 7.

---

## 2. Bloco A — Modelo jurídico-fiscal: intermediação vs. operação própria

1. Para que a receita bruta da EXP Tour seja **apenas comissão + taxa de serviço** (e não o valor cheio do contrato), o que precisa constar, exatamente: (a) no objeto social e CNAEs; (b) no contrato com o cliente (cláusulas de mandato/intermediação por conta e ordem); (c) no contrato/acordo com cada escola; (d) na escrituração contábil (como contabilizar os valores em trânsito)?
2. O valor do programa transita pela conta da empresa antes da remessa. Isso compromete a caracterização de intermediação? Há preferência por conta segregada, subconta ou outra forma de segregação que o contador recomende como evidência?
3. A **taxa de serviço de 6,6%** embutida na conversão cambial: deve ser destacada como taxa de intermediação na nota e no contrato, ou tratada de outra forma? Como formalizá-la para que seja inequivocamente receita de serviço (e não confundida com operação de câmbio, que a empresa não realiza)?
4. As **comissões recebidas das escolas no exterior** configuram exportação de serviços? Se sim, quais os efeitos (ISS na exportação conforme LC 116 art. 2º, PIS/COFINS, e futuramente CBS/IBS) e o que precisa constar na documentação (invoice à escola, contrato de representação)?
5. Se o contador entender que o modelo de intermediação **não se sustenta** no nosso caso, qual a estrutura alternativa recomendada e qual o custo tributário comparado (simulação nos dois modelos com um contrato-exemplo de R$ 80 mil cheio e margem de 18%)?

## 3. Bloco B — Regime tributário

6. Com receita bruta = comissão + taxas, qual regime recomendado (Simples, Lucro Presumido, Lucro Real) para o volume projetado de [preencher: nº de contratos/ano e margem total/ano]? Pedir a simulação comparativa.
7. Se em algum cenário a receita bruta for o **valor cheio**: em que ponto estouramos o teto do Simples (R$ 4,8 mi) e qual o impacto no Presumido (presunção de 32% sobre o cheio)? Essa simulação é o argumento econômico da estrutura de intermediação; queremos o número.
8. No Simples: qual anexo se aplica à intermediação de programas de intercâmbio e há fator R relevante?

## 4. Bloco C — NFS-e (parâmetros para a automação)

9. Qual o **item da lista de serviços** (LC 116/2003) correto para a nossa atividade no nosso município: 9.02 (agenciamento de programas de turismo/viagens), 10.05/10.09 (agenciamento/intermediação), ou outro? E o código de tributação municipal correspondente + alíquota de ISS?
10. **Fato gerador e momento de emissão**: emitimos a NFS-e da comissão/taxa (a) a cada parcela recebida (proporcional), (b) na confirmação da contratação (entrada paga), (c) na emissão da carta de aceite, ou (d) na conclusão do serviço? Precisamos de uma regra única e automatizável.
11. **Base e discriminação**: a nota sai só com o valor da comissão + taxa, mencionando o valor intermediado no campo de discriminação? Há exigência municipal de deduções na base (nota com valor total e dedução do repasse) ou a prática é nota direta pela remuneração?
12. O cliente recebe **recibo** de cada parcela (fluxo de caixa) e **NFS-e** da remuneração. Esse par documental é adequado ou o contador recomenda outro arranjo (ex.: fatura/conta de intermediação)?
13. ISS: nosso município já opera no **padrão nacional da NFS-e (ADN)**? Qual emissor/API o contador recomenda homologar para emissão automática (padrão nacional vs. emissor municipal), e quem fica responsável pela homologação?
14. Contratante **PJ** (empresa patrocinando funcionário): muda algo na nota (retenções de ISS/IR/CSRF pela tomadora)? Precisamos parametrizar retenções no sistema?
15. Cancelamentos e reembolsos: como tratar a NFS-e já emitida quando houver arrependimento em 7 dias (CDC) ou cancelamento com retenção parcial? Carta de correção, cancelamento de nota, nota de crédito? Precisamos da regra para automatizar o estorno fiscal junto com o estorno financeiro.

## 5. Bloco D — Reforma tributária (LC 214/2025)

16. Como o **regime específico de agências de turismo e viagens** da LC 214 alcança a nossa operação de intercâmbio: confirmamos que a base do IBS/CBS será a remuneração da intermediação? Há diferença de tratamento entre intercâmbio educacional e turismo?
17. O que muda **já em 2026** (ano-teste) nas nossas obrigações (destaque de CBS/IBS em documento fiscal, adaptação do leiaute da NFS-e) e qual o cronograma que devemos parametrizar no sistema até 2033?
18. Créditos: no regime específico, o que a empresa aproveita de crédito de CBS/IBS (marketing, tecnologia, serviços) e o que isso muda na comparação entre regimes do Bloco B?

## 6. Bloco E — Remessas internacionais e câmbio

19. **IRRF nas remessas às escolas**: confirmamos o enquadramento como remessa para **fins educacionais** (isenção da Lei 13.315/2016) quando o programa inclui curso? Quais os requisitos documentais (LOA, contrato, natureza da operação no contrato de câmbio) e quem deve figurar como remetente: a empresa (que paga a escola) ou o estudante? Há risco na remessa feita pela PJ por conta do cliente?
20. Programas sem curso formal (turismo educacional, grupos): qual o enquadramento e a alíquota de IRRF aplicável hoje, e como parametrizar por tipo de programa?
21. A empresa pretende manter **conta em moeda estrangeira** (no país ou exterior) para estacionar valores entre o recebimento e o pagamento das escolas. Quais as obrigações (declaração CBE se aplicável, tratamento de variação cambial na contabilidade e na tributação) e alguma objeção do contador a esse desenho?
22. Os valores repassados às escolas por conta dos clientes geram alguma obrigação acessória específica (e-Financeira, DIRF/EFD-Reinf sobre remessas, registro no novo marco cambial)?

## 7. Bloco F — Forio (marketplace)

23. No marketplace, quem emite a nota ao cliente final é o **vendedor** (agência/instituição); a Forio emite NFS-e do **take rate contra o vendedor**. Esse desenho está correto? Qual item de lista para a Forio (10.05 intermediação, 1.03/1.09 disponibilização de plataforma, ou outro)?
24. A Forio tem alguma responsabilidade fiscal sobre as transações que intermedeia (retenção de ISS de vendedores de outros municípios, responsabilidade solidária, obrigações de reporte de marketplace na LC 214)? O que precisamos coletar dos vendedores no onboarding (CNPJ, inscrição municipal, regime) para compliance?
25. Se o pagamento do cliente final transitar pela Forio (split de pagamento), isso muda o tratamento (receita própria vs. valores de terceiros) e exige arranjo específico (subadquirência, conta de pagamento)?

## 8. Bloco G — Saída da reunião (o que precisamos levar para o sistema)

Pedir ao contador que a reunião termine com esta tabela preenchida; ela vira configuração do motor:

| Parâmetro do sistema | Resposta do contador |
|---|---|
| Modelo (intermediação/próprio) e cláusulas mínimas do contrato | |
| Regime tributário recomendado e alíquotas efetivas | |
| Item LC 116 + código municipal + alíquota ISS | |
| Momento de emissão da NFS-e (evento gatilho) | |
| Base da nota e texto-padrão da discriminação | |
| Regra fiscal de cancelamento/estorno | |
| Retenções quando tomador PJ | |
| Enquadramento IRRF por tipo de programa (educacional/turismo) e remetente | |
| Obrigações da conta em moeda / CBE / variação cambial | |
| Emissor/API de NFS-e a homologar (nacional/municipal) | |
| Ajustes 2026 (CBS/IBS ano-teste) e cronograma de transição | |
| Forio: item de lista, retenções e obrigações de marketplace | |

**Documentos a levar**: minuta do contrato-mestre e do Termo de Adesão, um Anexo I exemplo com a memória de cálculo (valor na moeda, cotação, IOF, taxa 6,6%, comissão da escola), o acordo-padrão com fornecedor, e a projeção de volume/margem do primeiro ano.

*Nota: este briefing foi preparado como apoio; as definições fiscais e jurídicas são do contador/tributarista. Em caso de divergência entre este documento e a orientação profissional, vale a orientação profissional, que deve ser registrada por escrito.*
