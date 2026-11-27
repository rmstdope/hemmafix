import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { SKY_HINT_SCRIPT } from "@/components/sky/hint";
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
        {/* Runs from the server's HTML before the first paint; a soft navigation never runs it again. */}
        <script dangerouslySetInnerHTML={{ __html: SKY_HINT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          {/* At the bottom, as the agreed mockups draw notices: at the top they covered the field they were about.
              On a phone a notice spans the width, so it sits above the round + (FloatingAdd: 1rem over the
              bar, 3.5rem tall) rather than over it, where the + could not be tapped until it faded. */}
          <Toaster
            position="bottom-center"
            offset={{ bottom: "calc(var(--parts-bar-h) + env(safe-area-inset-bottom) + 1.5rem)" }}
            mobileOffset={{ bottom: "calc(var(--parts-bar-h) + env(safe-area-inset-bottom) + 5rem)" }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
