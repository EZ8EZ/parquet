import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { GlobalSearch } from "@/components/GlobalSearch";
import { DEFAULT_THEME, THEME_CHROME, themeBootScript } from "@/lib/theme";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Parquet - Dynasty Memory",
  description:
    "A dynasty fantasy basketball companion that remembers your decisions, audits your strategy, and scouts your leaguemates.",
  manifest: "/manifest.webmanifest",
  applicationName: "Parquet",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Parquet",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon-apple.png" }],
  },
};

export const viewport: Viewport = {
  // The server-rendered default; the boot script and the theme toggle move it with
  // the theme (THEME_CHROME) since browser chrome is beyond CSS's reach.
  themeColor: THEME_CHROME[DEFAULT_THEME],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      // The default, written server-side so the very first paint is the committed dark
      // identity. The boot script below replaces it only if this browser has chosen
      // otherwise (lib/theme.ts).
      data-theme={DEFAULT_THEME}
      className={`${inter.variable} ${fraunces.variable} ${jetbrains.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/*
          Blocking, inline, and before <body> deliberately: a theme applied from a React
          effect lands after the browser has painted the default, which is the flash of
          the wrong colours. This is the one case where a synchronous script beats doing
          it in React. Content is generated in lib/theme.ts, never from user input.
        */}
        <script
          dangerouslySetInnerHTML={{ __html: themeBootScript() }}
        />
      </head>
      <body className="min-h-full">
        {/* Mobile-first shell: single centered column, content padded above the
            fixed bottom tab bar. Widens gracefully on larger screens.

            The bottom padding clears BOTH fixed layers: the tab bar and the search
            button floating above it, whose top edge sits at safe-area + 140px (see
            GlobalSearch). The clearance lives here rather than on any one page
            because the button is global - every page can scroll content into that
            corner, and per-page padding would just re-fix the same bug page by page. */}
        <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
          <main className="flex-1 px-4 pb-[calc(env(safe-area-inset-bottom)+10rem)] pt-5 sm:px-6">
            {children}
          </main>
        </div>
        <BottomNav />
        <GlobalSearch />
      </body>
    </html>
  );
}
