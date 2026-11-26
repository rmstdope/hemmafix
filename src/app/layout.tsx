import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { SKY_HINT_SCRIPT } from "@/components/jul/sky-hint";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Hemmafix",
  description: "Familjens att-göra-lista",
  applicationName: "Hemmafix",
  appleWebApp: { capable: true, title: "Hemmafix", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="sv" className={`${geistSans.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* As Next's "preventing flash" guide: run from the server's HTML, inert in the browser's render. */}
        <script
          type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: SKY_HINT_SCRIPT }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          {/* At the bottom, as the agreed mockups draw notices: at the top they covered the field they were about. */}
          <Toaster
            position="bottom-center"
            offset={{ bottom: "calc(var(--parts-bar-h) + env(safe-area-inset-bottom) + 1.5rem)" }}
            mobileOffset={{ bottom: "calc(var(--parts-bar-h) + env(safe-area-inset-bottom) + 0.5rem)" }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
