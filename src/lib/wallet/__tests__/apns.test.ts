import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { apnsJwt } from "../apns";
import { ledgerNotOpen } from "../facts";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });

describe("apns", () => {
  it("mints an ES256 token in JOSE encoding under the key id and team", () => {
    const jwt = apnsJwt(
      { keyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), keyId: "ABC123DEFG", teamId: "TEAM000000" },
      1_700_000_000_000
    );
    const [h, c, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "ES256", kid: "ABC123DEFG" });
    expect(JSON.parse(Buffer.from(c, "base64url").toString())).toEqual({ iss: "TEAM000000", iat: 1_700_000_000 });
    /* r||s, 64 bytes — not DER */
    const sig = Buffer.from(s, "base64url");
    expect(sig.length).toBe(64);
    const v = createVerify("SHA256");
    v.update(`${h}.${c}`);
    expect(v.verify({ key: publicKey, dsaEncoding: "ieee-p1363" }, sig)).toBe(true);
  });
});

describe("ledgerNotOpen", () => {
  it("recognises a table or function the schema has not been told about", () => {
    expect(ledgerNotOpen({ code: "PGRST205", message: "Could not find the table 'public.wallet_tokens' in the schema cache" })).toBe(true);
    expect(ledgerNotOpen({ code: "PGRST202", message: "Could not find the function public.issue_wallet_token" })).toBe(true);
    expect(ledgerNotOpen({ code: "42P01", message: 'relation "wallet_tokens" does not exist' })).toBe(true);
    expect(ledgerNotOpen({ code: "42501", message: "new row violates row-level security policy" })).toBe(false);
    expect(ledgerNotOpen(null)).toBe(false);
  });
});
