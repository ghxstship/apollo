import type { Metadata, Viewport } from "next";
import { Marcellus, Jost, Space_Mono } from "next/font/google";
import Script from "next/script";
import { SwRegister } from "@/components/sw-register";
import { SITE_DOMAIN } from "@/lib/brand";

/* Self-hosted at build time — see src/styles/fonts.css for why this is not an
   @import. The variable names are the ones typography.css already reads. */
const marcellus = Marcellus({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-marcellus",
});
const jost = Jost({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-jost",
});
const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-space-mono",
});
import "./globals.css";

export const metadata: Metadata = {
  /* Without this every og:image and canonical resolves against localhost, so
     a link shared from production previews as http://localhost:3000/... */
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || `https://${SITE_DOMAIN}`),
  title: {
    default: "[UN] — anything goes here",
    template: "%s · [UN]",
  },
  description:
    "Twelve strangers. One yacht. Cameras from boarding to docking. No scripts, no second takes — whatever happens after sunset is the show.",
  manifest: "/manifest.webmanifest",
  icons: {
    apple: "/apple-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "[UN]",
  },
};

export const viewport: Viewport = {
  themeColor: "#101418",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/* Applies the persisted theme before first paint — dark is the default;
   only "light" sets an attribute. Runs from <head>, so it targets <html>. */
const themeInit = `try{var m=localStorage.getItem("un-theme")||"dark";var l=m==="system"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):m;if(l==="light")document.documentElement.setAttribute("data-theme","light")}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${marcellus.variable} ${jost.variable} ${spaceMono.variable}`}>
      <body>
        {/* First tab stop on every page. Without it a keyboard user walked the
            wordmark, sixteen nav links and Sign out before reaching content,
            on every navigation. */}
        <a href="#main" className="ls-skip">Skip to content</a>
        {/* A live region has to be in the document BEFORE the text lands in
            it — a node that arrives already carrying its message is, to most
            screen readers, just new content, and goes unread. Every toast the
            app raises is a receipt for something that already happened
            (an order placed, a pass held), so it announces through here. */}
        <div id="ls-announcer" role="status" aria-live="polite" aria-atomic="true" className="ls-visually-hidden" />
        <Script id="un-theme-init" strategy="beforeInteractive">{themeInit}</Script>
        <SwRegister />
        {children}
      </body>
    </html>
  );
}
