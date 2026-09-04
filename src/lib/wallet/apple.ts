import "server-only";
import { createHash, createHmac } from "node:crypto";
import forge from "node-forge";
import { ANCHOR, SITE_DOMAIN, SURFACES } from "@/lib/brand";
import { STANDING_LABEL } from "@/lib/membership";
import { passIconBytes } from "./apple-icon";
import { siteOrigin, walletUrl, type AppleConfig } from "./env";
import type { CardFacts } from "./facts";
import { zipStore } from "./zip";

/* The Apple Wallet pass — the member card as a .pkpass.

   A pass is a ZIP of pass.json, a manifest of SHA-1 digests of every other
   file, and a detached PKCS#7 signature over that manifest made with the
   Pass Type ID certificate and chained through Apple's WWDR intermediate. Node's
   crypto has no CMS/PKCS#7, which is the one job node-forge is here to do.

   Two facts are fixed here and nowhere else:

   The SERIAL is the member's profile id. A serial names a pass for its
   lifetime — the device registers under it, asks for updates under it, and
   Wallet replaces a pass in place only when the serial matches. A member has
   one card, so the card's serial is the member. The wallet token behind the
   barcode may be revoked and reissued; the serial does not move.

   The AUTHENTICATION TOKEN is what a device presents on every web-service
   call, and it is derived — HMAC of the serial under a key taken from the pass
   signing key — rather than stored, so no new column is needed and no row has
   to exist before a pass can be checked. Rotating the pass certificate rotates
   every authentication token, which is what a certificate rotation should do. */

/* Ink and ivory, as Wallet wants them: rgb() literals, because a pass renders
   with no stylesheet to resolve a token against. --noir-900 and --ivory-100
   and --ivory-500 from tokens.css; move those and move these. */
const INK = "rgb(20, 20, 20)";
const IVORY = "rgb(241, 241, 237)";
const IVORY_SOFT = "rgb(188, 188, 179)";

export function passSerial(facts: Pick<CardFacts, "profileId">): string {
  return facts.profileId;
}

export function passAuthToken(config: Pick<AppleConfig, "keyPem">, serial: string): string {
  const key = createHash("sha256").update(config.keyPem).digest();
  return createHmac("sha256", key).update(`applepass:${serial}`).digest("base64url");
}

/* Constant-time on the bytes, not a string compare — a device's token is
   attacker-chosen input on an unauthenticated route. */
export function authTokenMatches(config: Pick<AppleConfig, "keyPem">, serial: string, presented: string | null): boolean {
  if (!presented) return false;
  const expected = Buffer.from(passAuthToken(config, serial));
  const given = Buffer.from(presented);
  if (expected.length !== given.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ given[i];
  return diff === 0;
}

/* `Authorization: ApplePass <token>` — the only scheme the web service accepts. */
export function bearerFromHeader(header: string | null): string | null {
  const m = /^ApplePass\s+(\S+)\s*$/i.exec(header ?? "");
  return m ? m[1] : null;
}

export type PassJson = Record<string, unknown>;

export function buildPassJson(config: AppleConfig, facts: CardFacts, walletToken: string): PassJson {
  const serial = passSerial(facts);
  const standing = STANDING_LABEL[facts.standing] ?? facts.standing;
  const secondary: Array<Record<string, string>> = [
    { key: "number", label: "MEMBER", value: facts.memberNo ? `Nº ${facts.memberNo}` : "Unissued" },
    { key: "plan", label: "PLAN", value: facts.planLabel },
  ];
  const auxiliary: Array<Record<string, string>> = [];
  if (facts.city) auxiliary.push({ key: "city", label: "CITY", value: facts.city });
  /* A hold is stated on the face — the member reads it before the gangway does. */
  if (facts.standing !== "active") auxiliary.push({ key: "standing", label: "STANDING", value: standing });

  return {
    formatVersion: 1,
    passTypeIdentifier: config.passTypeId,
    teamIdentifier: config.teamId,
    serialNumber: serial,
    authenticationToken: passAuthToken(config, serial),
    webServiceURL: `${siteOrigin()}/api/wallet/apple`,
    organizationName: ANCHOR,
    description: `${ANCHOR} ${SURFACES.passbook}`,
    logoText: ANCHOR,
    backgroundColor: INK,
    foregroundColor: IVORY,
    labelColor: IVORY_SOFT,
    sharingProhibited: true,
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: walletUrl(walletToken),
        messageEncoding: "iso-8859-1",
        altText: facts.memberNo ? `Nº ${facts.memberNo}` : undefined,
      },
    ],
    generic: {
      primaryFields: [{ key: "name", label: SURFACES.passbook.toUpperCase(), value: facts.name }],
      secondaryFields: secondary,
      auxiliaryFields: auxiliary,
      backFields: [
        { key: "standing-back", label: "Standing", value: standing },
        { key: "gangway", label: "At the gangway", value: "Scan at the gangway. The skipper knows the rest." },
        { key: "site", label: "Home", value: `https://${SITE_DOMAIN}`, attributedValue: `<a href="${siteOrigin()}/card">${SITE_DOMAIN}</a>` },
      ],
    },
  };
}

/* manifest.json — SHA-1 of every file in the archive except itself and the
   signature. SHA-1 because that is what the format specifies for the manifest;
   the signature over it is SHA-256. */
export function buildManifest(files: Record<string, Buffer>): string {
  const manifest: Record<string, string> = {};
  for (const name of Object.keys(files).sort()) {
    manifest[name] = createHash("sha1").update(files[name]).digest("hex");
  }
  return JSON.stringify(manifest);
}

/* The pass key, plain or encrypted. An exported .p12 converted with openssl
   keeps its passphrase unless -nodes was passed; both are accepted, and a
   wrong passphrase is said plainly rather than surfacing as an ASN.1 error. */
function readSigningKey(config: AppleConfig) {
  if (config.keyPassphrase) {
    const key = forge.pki.decryptRsaPrivateKey(config.keyPem, config.keyPassphrase);
    if (!key) throw new Error("APPLE_PASS_KEY_PEM did not decrypt with APPLE_PASS_KEY_PASSPHRASE");
    return key;
  }
  return forge.pki.privateKeyFromPem(config.keyPem);
}

/* Detached PKCS#7 over the manifest bytes: signer = Pass Type ID certificate,
   with Apple's WWDR intermediate carried alongside so a device can walk the
   chain up to the Apple root it already trusts. */
export function signManifest(config: AppleConfig, manifest: Buffer): Buffer {
  const cert = forge.pki.certificateFromPem(config.certPem);
  const wwdr = forge.pki.certificateFromPem(config.wwdrPem);
  const key = readSigningKey(config);

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifest.toString("binary"), "raw");
  p7.addCertificate(wwdr);
  p7.addCertificate(cert);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime },
    ],
  });
  p7.sign({ detached: true });
  return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), "binary");
}

export function buildPkpass(config: AppleConfig, facts: CardFacts, walletToken: string): Buffer {
  const icon = passIconBytes();
  const files: Record<string, Buffer> = {
    "pass.json": Buffer.from(JSON.stringify(buildPassJson(config, facts, walletToken)), "utf8"),
    "icon.png": icon,
    "icon@2x.png": icon,
    "icon@3x.png": icon,
    "logo.png": icon,
  };
  const manifest = Buffer.from(buildManifest(files), "utf8");
  const signature = signManifest(config, manifest);
  return zipStore([
    ...Object.entries(files).map(([name, data]) => ({ name, data })),
    { name: "manifest.json", data: manifest },
    { name: "signature", data: signature },
  ]);
}

export const PKPASS_MIME = "application/vnd.apple.pkpass";

export function pkpassResponse(bytes: Buffer, lastModified: string | null, extra?: Record<string, string>): Response {
  const headers: Record<string, string> = {
    "Content-Type": PKPASS_MIME,
    "Content-Disposition": `attachment; filename="un-member-card.pkpass"`,
    "Cache-Control": "private, no-store",
    ...extra,
  };
  if (lastModified) headers["Last-Modified"] = new Date(lastModified).toUTCString();
  return new Response(new Uint8Array(bytes), { status: 200, headers });
}
