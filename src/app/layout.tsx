import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { SwRegister } from "@/components/sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SYRIUS SOCIAL — The Unscripted Social Experiment.",
    template: "%s · SYRIUS SOCIAL",
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
    title: "SYRIUS",
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
const themeInit = `try{var m=localStorage.getItem("syrius-theme")||"dark";var l=m==="system"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):m;if(l==="light")document.documentElement.setAttribute("data-theme","light")}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Script id="syrius-theme-init" strategy="beforeInteractive">{themeInit}</Script>
        <SwRegister />
        {children}
      </body>
    </html>
  );
}
