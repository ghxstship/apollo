import "server-only";
import { createSign } from "node:crypto";
import { ANCHOR, SURFACES } from "@/lib/brand";
import { STANDING_LABEL } from "@/lib/membership";
import { siteOrigin, walletUrl, type GoogleConfig } from "./env";
import type { CardFacts } from "./facts";

/* The Google Wallet pass — a genericObject behind a Save link.

   Google's flow is a signed JWT: the pass object is the payload, the issuer's
   service account signs it RS256, and https://pay.google.com/gp/v/save/<jwt>
   is the whole of the "Save to Google Wallet" button. Node's crypto signs
   RS256 natively, so no dependency is needed on this side.

   The CLASS — the template every member pass shares — has to exist before an
   object of it can be saved. It is created once through the Wallet REST API,
   on the first issue, with an access token minted from the same service
   account; the result is remembered for the life of the process so the check
   costs one round trip per cold start. The class could ride in the JWT
   instead, but a Save link is a URL, and a URL with a class, an object and a
   342-character signature in it is over the length some browsers will carry. */

export const CLASS_SUFFIX = "un-member";
const WALLET_API = "https://walletobjects.googleapis.com/walletobjects/v1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer";

/* --noir-900 and --ivory-100 as hex: Google takes hex, and a pass renders
   with no stylesheet to resolve a token against. */
const INK_HEX = "#141414";

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function signJwtRs256(claims: Record<string, unknown>, keyPem: string, kid?: string): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", ...(kid ? { kid } : {}) }));
  const body = b64url(JSON.stringify(claims));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${body}`);
  return `${header}.${body}.${signer.sign(keyPem, "base64url")}`;
}

export function classId(config: Pick<GoogleConfig, "issuerId">): string {
  return `${config.issuerId}.${CLASS_SUFFIX}`;
}

export function objectId(config: Pick<GoogleConfig, "issuerId">, facts: Pick<CardFacts, "profileId">): string {
  /* Object ids admit letters, digits, dot, underscore and hyphen; a uuid fits. */
  return `${config.issuerId}.${facts.profileId}`;
}

export function buildGenericClass(config: GoogleConfig): Record<string, unknown> {
  return {
    id: classId(config),
    /* Three rows on the card face: member number, plan, city — the same three
       the Apple pass sets under the name. */
    classTemplateInfo: {
      cardTemplateOverride: {
        cardRowTemplateInfos: [
          {
            threeItems: {
              startItem: { firstValue: { fields: [{ fieldPath: "object.textModulesData['number']" }] } },
              middleItem: { firstValue: { fields: [{ fieldPath: "object.textModulesData['plan']" }] } },
              endItem: { firstValue: { fields: [{ fieldPath: "object.textModulesData['city']" }] } },
            },
          },
        ],
      },
    },
    enableSmartTap: false,
    multipleDevicesAndHoldersAllowedStatus: "ONE_USER_ALL_DEVICES",
  };
}

export function buildGenericObject(config: GoogleConfig, facts: CardFacts, walletToken: string): Record<string, unknown> {
  const standing = STANDING_LABEL[facts.standing] ?? facts.standing;
  const textModules: Array<{ id: string; header: string; body: string }> = [
    { id: "number", header: "Member", body: facts.memberNo ? `Nº ${facts.memberNo}` : "Unissued" },
    { id: "plan", header: "Plan", body: facts.planLabel },
    { id: "city", header: "City", body: facts.city || "—" },
  ];
  if (facts.standing !== "active") textModules.push({ id: "standing", header: "Standing", body: standing });

  return {
    id: objectId(config, facts),
    classId: classId(config),
    /* Google's own two states: ACTIVE and INACTIVE. A paused member's pass is
       still their pass; the hold is written on it and read at the gangway. */
    state: facts.standing === "departed" ? "INACTIVE" : "ACTIVE",
    hexBackgroundColor: INK_HEX,
    cardTitle: { defaultValue: { language: "en", value: ANCHOR } },
    header: { defaultValue: { language: "en", value: facts.name } },
    subheader: { defaultValue: { language: "en", value: SURFACES.passbook } },
    barcode: {
      type: "QR_CODE",
      value: walletUrl(walletToken),
      alternateText: facts.memberNo ? `Nº ${facts.memberNo}` : undefined,
    },
    textModulesData: textModules,
    linksModuleData: {
      uris: [{ uri: `${siteOrigin()}/card`, description: SURFACES.passbook, id: "card" }],
    },
  };
}

/* The Save link. `origins` names the pages allowed to host the button, which
   is this deployment and nothing else. */
export function saveLink(config: GoogleConfig, facts: CardFacts, walletToken: string): string {
  const now = Math.floor(Date.now() / 1000);
  const jwt = signJwtRs256(
    {
      iss: config.serviceAccountEmail,
      aud: "google",
      typ: "savetowallet",
      iat: now,
      origins: [siteOrigin()],
      payload: { genericObjects: [buildGenericObject(config, facts, walletToken)] },
    },
    config.serviceAccountKeyPem
  );
  return `https://pay.google.com/gp/v/save/${jwt}`;
}

/* An access token for the Wallet REST API, by the JWT-bearer grant. */
async function accessToken(config: GoogleConfig): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwtRs256(
    { iss: config.serviceAccountEmail, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 300 },
    config.serviceAccountKeyPem
  );
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: string };
    return json.access_token ?? null;
  } catch {
    return null;
  }
}

/* Remembered per process, per issuer — a cold start pays one GET. */
const CLASS_READY = new Set<string>();

export type ClassOutcome = "exists" | "created" | "unreachable";

export async function ensureGenericClass(config: GoogleConfig): Promise<ClassOutcome> {
  const id = classId(config);
  if (CLASS_READY.has(id)) return "exists";
  const token = await accessToken(config);
  if (!token) return "unreachable";
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  try {
    const got = await fetch(`${WALLET_API}/genericClass/${encodeURIComponent(id)}`, { headers: auth });
    if (got.ok) {
      CLASS_READY.add(id);
      return "exists";
    }
    if (got.status !== 404) return "unreachable";
    const made = await fetch(`${WALLET_API}/genericClass`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify(buildGenericClass(config)),
    });
    if (!made.ok) return "unreachable";
    CLASS_READY.add(id);
    return "created";
  } catch {
    return "unreachable";
  }
}

/* Push the current facts onto an object a member has already saved, so a
   plan change or a hold reaches the phone without a second Save. Best-effort:
   an object never saved answers 404 and that is not a failure. */
export async function updateGenericObject(config: GoogleConfig, facts: CardFacts, walletToken: string): Promise<boolean> {
  const token = await accessToken(config);
  if (!token) return false;
  try {
    const res = await fetch(`${WALLET_API}/genericObject/${encodeURIComponent(objectId(config, facts))}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildGenericObject(config, facts, walletToken)),
    });
    return res.ok;
  } catch {
    return false;
  }
}
