import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { APP_CONTENT_ID, Desk } from "@/components/Desk";
import { getDeskData } from "@/lib/desk";
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

/**
 * ASYNC, because the Desk's context row is about the league rather than about the
 * route - "5-Year Plan · 27 to capture" is the same answer on every page, so it is
 * assembled once here rather than threaded through twenty-seven pages.
 *
 * This costs less than it looks like it should. D38's corpus cache is keyed by
 * nothing at all (one entry for the whole league, 5 minute TTL, per-viewer identity
 * resolved after the await from cookies), so on any page that already reads the
 * corpus - 24 of the app's 27 - this is a warm Map lookup and not a second assembly.
 * The three that do not (/about, /settings, /claim/invalid) are the real bill: they
 * were statically rendered and are now dynamic. Measured rather than assumed; see D39.
 */
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const desk = await getDeskData();
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
        {/* Mobile-first shell: single centered column, content padded above the Desk.
            Widens gracefully on larger screens.

            8.5rem = the Desk's 116pt of resting chrome plus 20pt of air, so the last
            line of any page clears the handle rather than tucking under it. It was
            6rem for the old 94pt tab bar. Still ONE fixed layer to clear, not two:
            round 6 retired the floating search button (it collided with real content
            on every content-heavy page added since round 1, flagged twice) and search
            now lives inside the Desk's drawer, which occupies no resting height.

            The id is how the expanded drawer makes this subtree `inert` - the
            background half of the modal contract lives in components/Desk.tsx. */}
        <div
          id={APP_CONTENT_ID}
          className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col"
        >
          <main className="flex-1 px-4 pb-[calc(env(safe-area-inset-bottom)+8.5rem)] pt-5 sm:px-6">
            {children}
          </main>
        </div>
        <Desk data={desk} />
      </body>
    </html>
  );
}
