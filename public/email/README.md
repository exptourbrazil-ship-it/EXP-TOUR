# Assets dos e-mails

## logo-exp-tour.png

Logo usado no cabeçalho de todos os e-mails (`src/lib/email.ts`).

**Por que PNG e não SVG:** Gmail, Outlook e Yahoo não renderizam
`<img src="*.svg">` em e-mail. O cabeçalho apontava para o `.svg` hospedado no
WordPress e o logo não aparecia para ninguém — só o Apple Mail renderizava, o
que mascarava o problema em teste. **Nunca voltar para SVG aqui.**

Especificação do arquivo atual: 300 × 223 px, fundo `#042f1b` (a mesma cor do
cabeçalho do e-mail), sem canal alfa. É exibido a 150 px de largura — o dobro
cobre telas retina.

Para regerar a partir de uma arte quadrada com fundo na cor da marca:

```bash
convert origem.png -fuzz 6% -trim +repage \
  -bordercolor '#042f1b' -border 24 \
  -background '#042f1b' -alpha remove -alpha off \
  -resize 300x -strip public/email/logo-exp-tour.png
```

## Resolução da URL

`src/lib/email.ts` monta a URL nesta ordem:

1. `EMAIL_LOGO_URL`, se definida (útil se o arquivo for para um CDN);
2. `${NEXT_PUBLIC_APP_URL}/email/logo-exp-tour.png`;
3. se nenhuma das duas existir, o cabeçalho renderiza um **wordmark em texto**
   ("EXP TOUR / TRAVEL EXPERIENCE" em dourado) em vez de um `<img>`.

O passo 3 é proposital: um texto que sempre aparece — inclusive com imagens
bloqueadas, o padrão do Gmail para remetentes novos — é melhor do que um
`<img>` que pode virar ícone quebrado.

Ou seja: **`NEXT_PUBLIC_APP_URL` precisa estar configurada na Vercel** para o
logo aparecer. A mesma variável define a `notification_url` das cobranças do
Mercado Pago (`src/lib/mercadopago.ts`).
