import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = {
  variable: "--font-geist-sans",
};

const geistMono = {
  variable: "--font-geist-mono",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f6" },
    { media: "(prefers-color-scheme: dark)", color: "#111b15" },
  ],
};

export const metadata: Metadata = {
  title: "OmniPOS — Sistema Punto de Venta Multirubro",
  description: "Sistema completo de punto de venta e inventario adaptable para todo tipo de negocio: tiendas de barrio, droguerías, ferreterías, ropa y comercio en general.",
  keywords: ["POS", "punto de venta", "inventario", "tienda de barrio", "droguería", "ferretería", "caja", "facturación"],
  authors: [{ name: "OmniPOS" }],
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OmniPOS",
  },
  icons: {
    icon: "/logo.svg",
    shortcut: "/logo.svg",
    apple: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground transition-colors duration-200`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Sonner position="top-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
