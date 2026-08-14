# Assets dos e-mails

## logo-exp-tour.png

O cabeçalho dos e-mails (`src/lib/email.ts`) usa este arquivo.

**Requisitos:**

- Formato **PNG** (nunca SVG — Gmail, Outlook e Yahoo não renderizam SVG em
  e-mail; era essa a causa do logo não aparecer).
- Fundo na cor da marca `#042f1b` (o cabeçalho do e-mail é verde escuro), ou
  fundo transparente.
- Largura de exportação **300 px** (é exibido a 150 px; o dobro cobre telas
  retina).

**Depois de commitar o arquivo**, definir na Vercel:

```
EMAIL_LOGO_URL=https://exp-tour.vercel.app/email/logo-exp-tour.png
```

Enquanto essa variável não existir, o cabeçalho renderiza um wordmark em texto
("EXP TOUR / TRAVEL EXPERIENCE" em dourado). Isso é proposital: um texto que
sempre aparece é melhor do que um `<img>` que pode virar ícone quebrado.
