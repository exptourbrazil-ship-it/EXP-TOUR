import type { Metadata } from "next";
import { createElement } from "react";
import "./globals.css";

export const metadata: Metadata = {
    title: "Area do Cliente | EXP Tour",
    description: "Portal do cliente EXP Tour - contratos, documentos e parcelas",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return createElement(
          "html",
      { lang: "pt-BR" },
          createElement(
                  "head",
                  null,
                  createElement("link", { rel: "preconnect", href: "https://fonts.googleapis.com" }),
                  createElement("link", { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" }),
                  createElement("link", {
                            // Bellefair (titulo EXP Tour) + Inter (identidade Forio, 400/500).
                            href: "https://fonts.googleapis.com/css2?family=Bellefair&family=Inter:wght@400;500&display=swap",
                            rel: "stylesheet",
                  })
                ),
          createElement(
                  "body",
            { className: "min-h-screen bg-brand font-sans text-neutral-900 antialiased" },
                  children
                )
        );
}
