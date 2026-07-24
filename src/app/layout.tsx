import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "LYRE SOCIAL — Voyages and salons, at sea and ashore.",
    template: "%s · LYRE SOCIAL",
  },
  description:
    "A membership club for experiential connection at sea and ashore. Voyages, salons, and the people worth crossing water for. Home port: Marina del Rey.",
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
   only "light" sets an attribute. */
const themeInit = `try{var m=localStorage.getItem("lyre-theme")||"dark";var l=m==="system"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):m;if(l==="light")document.body.setAttribute("data-theme","light")}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {children}
      </body>
    </html>
  );
}
