import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { SwRegister } from "@/components/sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "LYRE SOCIAL — Sea Days and Port Days, aboard and ashore.",
    template: "%s · LYRE SOCIAL",
  },
  description:
    "A membership club for experiential connection at sea and ashore. Sea Days, Port Days, and the people worth crossing water for. Home port: Marina del Rey.",
  manifest: "/manifest.webmanifest",
  icons: {
    apple: "/apple-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "LYRE",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0B0C",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/* Applies the persisted theme before first paint — dark is the default;
   only "light" sets an attribute. Runs from <head>, so it targets <html>. */
const themeInit = `try{var m=localStorage.getItem("lyre-theme")||"dark";var l=m==="system"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):m;if(l==="light")document.documentElement.setAttribute("data-theme","light")}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Script id="lyre-theme-init" strategy="beforeInteractive">{themeInit}</Script>
        <SwRegister />
        {children}
      </body>
    </html>
  );
}
