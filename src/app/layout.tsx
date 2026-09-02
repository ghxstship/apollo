import type { Metadata, Viewport } from "next";
import { Anton, Archivo, Instrument_Serif, Space_Mono } from "next/font/google";
import Script from "next/script";
import { SwRegister } from "@/components/sw-register";
import { ANCHOR, SITE_DOMAIN, TAGLINE, THEME_STORAGE_KEY } from "@/lib/brand";

/* The four [un] families, self-hosted at build time. next/font resolves each
   one against the Google Fonts CSS API when the build runs and copies the files
   into the deployment, so nothing here pins a gstatic URL — the last hardcoded
   one was a v4 path that 404'd the day Google moved to v5, taking the display
   face with it. It also keeps the CSP closed: no fonts.googleapis.com in
   style-src, no fonts.gstatic.com in font-src, and no member's browser
   announcing itself to Google on every page load.

   Each loader publishes a CSS variable carrying the real family plus the
   metric-matched local fallback ("Anton", "Anton Fallback"); src/styles/fonts.css
   prepends those variables onto the family stacks tokens.css declares verbatim,
   which is what gets the size-adjusted fallback in front of plain Arial Narrow
   and keeps the swap from reflowing the page. See that file for the full why. */
const anton = Anton({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-anton",
});
/* 400 body · 500 UI and buttons · 700 headings, and nothing else — the brand
   permits exactly these three. Naming them rather than taking Archivo's whole
   variable range is what stops a 600 appearing somewhere and reading as a
   weight the system does not have. */
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-archivo",
});
/* Editorial only — campaign headlines and deck openers, always italic, never in
   UI or navigation. The upright is loaded because a serif with no roman
   synthesises one badly wherever a nested element resets font-style. */
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-instrument-serif",
});
const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-space-mono",
});
import "../styles/globals.css";

export const metadata: Metadata = {
  /* Without this every og:image and canonical resolves against localhost, so
     a link shared from production previews as http://localhost:3000/... */
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || `https://${SITE_DOMAIN}`),
  /* The tagline lockup takes no punctuation between the anchor and the phrase —
     "[un] anything goes here" is the mark, and a dash makes it a sentence. */
  title: {
    default: `${ANCHOR} ${TAGLINE}`,
    template: `%s · ${ANCHOR}`,
  },
  /* Was: a global club running one weekly seven-hour sailing. The club is in
     two cities, not the world, and the weekly sailing is the Anchor series —
     twelve of the season's fifty-two episodes. The other four series are what
     the club mostly does.

     CAPACITY, PENDING OWNER CONFIRMATION: forty is the seeded fleet — four
     yachts at ten passes each — and the figure the press boilerplate has always
     carried. The operating playbook models 100 guests for the flagship. Four
     public surfaces state this number; all four now say forty, and all four
     change together when the owner settles it. */
  description:
    "An IRL social club, filmed. Season I is fifty-two episodes across five series, afloat and ashore, out of Miami — forty aboard the flagship. No scripts. No second takes.",
  manifest: "/manifest.webmanifest",
  icons: {
    apple: "/apple-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: ANCHOR,
  },
};

export const viewport: Viewport = {
  /* Paper, matching --surface-page in tokens.css. The palette inverted with the
     rebrand: this used to be noir because the old system was dark-first. */
  themeColor: "#EDEDEA",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/* Applies the persisted theme before first paint. Polarity inverted with the
   rebrand: tokens.css is paper-first, so light is the default and carries no
   attribute, and only "dark" stamps one — the mirror of what this script did
   under the old dark-first palette. Getting this backwards is not a subtle
   bug: it paints ink text on an ink ground for the duration of the first
   paint, on every load. Runs from <head>, so it targets <html>. */
const themeInit = `try{var m=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})||"light";var l=m==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):m;if(l==="dark")document.documentElement.setAttribute("data-theme","dark")}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${anton.variable} ${archivo.variable} ${instrumentSerif.variable} ${spaceMono.variable}`}
    >
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
        <div id="ls-announcer-alert" role="alert" aria-live="assertive" aria-atomic="true" className="ls-visually-hidden" />
        <Script id="un-theme-init" strategy="beforeInteractive">{themeInit}</Script>
        <SwRegister />
        {children}
      </body>
    </html>
  );
}
