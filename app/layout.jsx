import localFont from "next/font/local";
import "./globals.css";
import { APP_CONTENT_ID, Desk } from "@/components/Desk";
import { AppHeader } from "@/components/shell/AppHeader";
import { DataGapBanner } from "@/components/DataGapBanner";
import { getDeskData } from "@/lib/desk";

// Self-hosted (next/font/local): the build never reaches a font CDN.
const inter = localFont({
  src: "./fonts/InterVariable.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

export const metadata = {
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

export const viewport = {
  themeColor: "#0b0d10",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Async because the shell's status bar is about the league, not the route; D38's
 * corpus cache makes this a warm lookup on every page that already reads it (D39).
 */
export default async function RootLayout({ children }) {
  const desk = await getDeskData();
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">
        <div
          id={APP_CONTENT_ID}
          className="relative mx-auto flex min-h-dvh w-full max-w-2xl flex-col"
        >
          <AppHeader seat={desk?.seat ?? null} />
          <main className="flex-1 px-4 pb-[calc(env(safe-area-inset-bottom)+var(--statusbar-h)+var(--tabbar-h)+1.5rem)] pt-2 sm:px-6">
            <DataGapBanner />
            {children}
          </main>
        </div>
        <Desk data={desk} />
      </body>
    </html>
  );
}
