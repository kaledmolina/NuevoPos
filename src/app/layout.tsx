import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster as Sonner } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Droguería POS — Sistema de Punto de Venta",
  description: "Sistema completo de punto de venta e inventario para droguería: caja, arqueo, vencimientos, compras y ventas.",
  keywords: ["droguería", "POS", "punto de venta", "inventario", "farmacia"],
  authors: [{ name: "Droguería POS" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Sonner position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
