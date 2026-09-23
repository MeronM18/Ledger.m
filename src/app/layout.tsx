import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Switzer isn't on Google Fonts, so next/font/google can't load it — pulled
// from Fontshare's CDN via a <link> tag instead (React 19 hoists it to
// <head> automatically). A plain CSS `@import url(...)` in globals.css was
// tried first but Turbopack's CSS pipeline silently drops remote @import
// rules — confirmed via the compiled output containing no @font-face for
// Switzer and no network request for it at all.
const FONTSHARE_SWITZER_URL =
  "https://api.fontshare.com/v2/css?f[]=switzer@400,500,600&display=swap";

const bodoniModa = Bodoni_Moda({
  variable: "--font-bodoni",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

// Colors the phone's browser bar to match the app instead of a white strip.
export const viewport: Viewport = {
  themeColor: "#0a0a0b",
};

export const metadata: Metadata = {
  // Each page sets its own title ("Budgets"), shown as "Budgets · Ledger.m"
  // so tabs and history are tellable apart.
  title: { default: "Ledger.m", template: "%s · Ledger.m" },
  description: "Personal finance tracker",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bodoniModa.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="stylesheet" href={FONTSHARE_SWITZER_URL} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
