# The brand faces, self-hosted for email

These are for LETTERS, not for the site. The site loads the same families
through `next/font/google`, which self-hosts them at build time under hashed
filenames — fine for a page, useless for an email, which needs a stable
absolute URL that still resolves when somebody opens the letter two years from
now.

## Why not the Google Fonts CDN

A `@font-face` served from `fonts.gstatic.com` makes every recipient's mail
client fetch a file from Google when the letter is opened. That discloses the
reader's IP address and the moment they opened it, to a third party, with no
consent — which is a tracking pixel wearing a font's clothes. A German court
fined a site operator for exactly that pattern in January 2022 (LG München I,
3 O 17493/20), and in email it is worse than on the web because the reader
never chose to visit anything.

Self-hosted, the fetch goes to the club, which already sends the letter.

## What is here

  Anton-{latin,latin-ext}.woff2       display, one weight
  Archivo-{latin,latin-ext}.woff2     body — VARIABLE, one file covers 100-900
  SpaceMono-{400,700}-{latin,latin-ext}.woff2   labels and figures

Two subsets, not one: latin-ext carries the Central and Eastern European
accents the club's locale list needs. Arabic and Hebrew are in that list and
are in NONE of these faces — those letters fall back to the reader's system
serif, which is the honest outcome and not something a subset can fix.

All three are SIL Open Font License 1.1, which permits redistribution.

## Which clients actually use them

Apple Mail, iOS Mail, Outlook for Mac, Samsung Mail, Thunderbird.

NOT Gmail on any platform, and NOT Outlook on Windows — both strip
`@font-face` outright. That is most of the world, so the fallback stack is what
most people read and is the part worth getting right.

## The header that makes it work

A mail client renders the message from a null origin, so its `@font-face`
fetch is cross-origin and CORS-governed. Without `Access-Control-Allow-Origin`
WebKit blocks every face and falls back silently — the failure looks like
nothing at all, which is why it is easy to ship. `next.config.ts` sets that
header, plus a one-year immutable cache, on `/fonts/:path*`. Files are named
by family and subset and are only ever replaced under a new name.
