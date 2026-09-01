import type { Metadata } from "next";
import { Inter, Outfit, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// Body copy.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

// Display type.
//
// Product Sans / Google Sans are proprietary Google typefaces — they are not
// on Google Fonts and cannot be redistributed, so they cannot be used here.
// Outfit is the closest free geometric sans: same single-storey construction,
// circular bowls and even stroke weight. To use the real thing, drop the woff2
// files into app/fonts/ and swap this for next/font/local.
const display = Outfit({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SatQuery AI — Agentic Remote Sensing Assistant",
  description:
    "An interactive vision-language assistant for multimodal remote sensing image analysis through text queries. ISRO / SAC.",
};

import { AuthProvider } from "@/lib/auth-context";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${display.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <meta name="darkreader-lock" content="darkreader-lock" />
      </head>
      <body suppressHydrationWarning className="min-h-full flex">
        <AuthProvider>
          <TooltipProvider>
            {children}
          </TooltipProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
