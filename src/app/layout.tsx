import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
title: "Area do Cliente | EXP Tour",
description: "Portal do cliente EXP Tour - contratos, documentos e parcelas",
};

export default function RootLayout({
children,
}: {
children: React.ReactNode;
}) {
return (
<html lang="pt-BR">
<body className="min-h-screen bg-neutral-50 text-neutral-900">
{children}
</body>
</html>
);
}
