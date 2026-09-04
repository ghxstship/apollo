import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { GoogleConfig } from "../env";
import type { CardFacts } from "../facts";
import { buildGenericObject, classId, objectId, saveLink, signJwtRs256 } from "../google";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const config: GoogleConfig = {
  issuerId: "3388000000012345678",
  serviceAccountEmail: "wallet@un-test.iam.gserviceaccount.com",
  serviceAccountKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
};
const facts: CardFacts = {
  profileId: "3b6f2e9a-1c4d-4e5f-8a9b-0c1d2e3f4a5b",
  name: "Ada Marlow",
  memberNo: "0047",
  planLabel: "National",
  city: "Miami",
  standing: "active",
};

function decode(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
}

describe("google wallet", () => {
  it("signs RS256 that the public key verifies", () => {
    const jwt = signJwtRs256({ hello: "world" }, config.serviceAccountKeyPem);
    const [h, b, s] = jwt.split(".");
    expect(decode(h)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decode(b)).toEqual({ hello: "world" });
    const v = createVerify("RSA-SHA256");
    v.update(`${h}.${b}`);
    expect(v.verify(publicKey, Buffer.from(s, "base64url"))).toBe(true);
  });

  it("files the object under the issuer's class and the member's id", () => {
    expect(classId(config)).toBe("3388000000012345678.un-member");
    expect(objectId(config, facts)).toBe(`3388000000012345678.${facts.profileId}`);
    const obj = buildGenericObject(config, facts, "tok-1");
    expect(obj.state).toBe("ACTIVE");
    expect((obj.barcode as { value: string }).value).toMatch(/\/w\/tok-1$/);
    const rows = obj.textModulesData as Array<{ id: string; body: string }>;
    expect(rows.map((r) => `${r.id}=${r.body}`)).toEqual(["number=Nº 0047", "plan=National", "city=Miami"]);
  });

  it("writes a hold onto the pass and closes a departed one", () => {
    const paused = buildGenericObject(config, { ...facts, standing: "paused" }, "t");
    expect((paused.textModulesData as Array<{ id: string }>).some((r) => r.id === "standing")).toBe(true);
    expect(paused.state).toBe("ACTIVE");
    expect(buildGenericObject(config, { ...facts, standing: "departed" }, "t").state).toBe("INACTIVE");
  });

  it("builds a save link whose JWT is a savetowallet token from the issuer", () => {
    const link = saveLink(config, facts, "tok-1");
    expect(link.startsWith("https://pay.google.com/gp/v/save/")).toBe(true);
    const claims = decode(link.split("/save/")[1].split(".")[1]);
    expect(claims.iss).toBe(config.serviceAccountEmail);
    expect(claims.aud).toBe("google");
    expect(claims.typ).toBe("savetowallet");
    const payload = claims.payload as { genericObjects: Array<{ id: string }> };
    expect(payload.genericObjects[0].id).toBe(objectId(config, facts));
  });
});
