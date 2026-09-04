import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authTokenMatches, bearerFromHeader, buildManifest, buildPassJson, buildPkpass, passAuthToken } from "../apple";
import type { AppleConfig } from "../env";
import type { CardFacts } from "../facts";

/* The signing path end to end, against a throwaway chain minted with the
   openssl CLI: a self-signed stand-in for WWDR and a pass certificate it
   issued. Nothing here is Apple's; what is proved is that the archive is a
   ZIP Wallet can open and that the signature over manifest.json verifies
   against the certificates carried inside it. Where openssl is not on the
   path the signing cases are skipped and say so. */

const openssl = spawnSync("openssl", ["version"]).status === 0;
const facts: CardFacts = {
  profileId: "3b6f2e9a-1c4d-4e5f-8a9b-0c1d2e3f4a5b",
  name: "Ada Marlow",
  memberNo: "0047",
  planLabel: "Regional",
  city: "Miami",
  standing: "active",
};

let dir = "";
let config: AppleConfig;

function sh(args: string[]) {
  const r = spawnSync("openssl", args, { cwd: dir });
  if (r.status !== 0) throw new Error(`openssl ${args[0]} failed: ${r.stderr}`);
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "un-wallet-"));
  if (!openssl) return;
  sh(["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "wwdr-key.pem", "-out", "wwdr.pem", "-days", "2", "-subj", "/CN=Stand-in WWDR"]);
  sh(["req", "-newkey", "rsa:2048", "-nodes", "-keyout", "pass-key.pem", "-out", "pass.csr", "-subj", "/CN=Pass Type ID: pass.test.un"]);
  sh(["x509", "-req", "-in", "pass.csr", "-CA", "wwdr.pem", "-CAkey", "wwdr-key.pem", "-CAcreateserial", "-out", "pass.pem", "-days", "2"]);
  config = {
    certPem: readFileSync(join(dir, "pass.pem"), "utf8"),
    keyPem: readFileSync(join(dir, "pass-key.pem"), "utf8"),
    wwdrPem: readFileSync(join(dir, "wwdr.pem"), "utf8"),
    passTypeId: "pass.test.un",
    teamId: "TEAM000000",
    keyPassphrase: undefined,
  };
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("pass.json", () => {
  const cfg: AppleConfig = { certPem: "", keyPem: "key-material", wwdrPem: "", passTypeId: "pass.test.un", teamId: "TEAM000000", keyPassphrase: undefined };

  it("names the member, the plan, the number and the city, and points the barcode at /w/<token>", () => {
    const pass = buildPassJson(cfg, facts, "11111111-2222-3333-4444-555555555555");
    expect(pass.serialNumber).toBe(facts.profileId);
    expect(pass.passTypeIdentifier).toBe("pass.test.un");
    const generic = pass.generic as { primaryFields: Array<{ value: string }>; secondaryFields: Array<{ value: string }>; auxiliaryFields: Array<{ value: string }> };
    expect(generic.primaryFields[0].value).toBe("Ada Marlow");
    expect(generic.secondaryFields.map((f) => f.value)).toEqual(["Nº 0047", "Regional"]);
    expect(generic.auxiliaryFields.map((f) => f.value)).toEqual(["Miami"]);
    const barcodes = pass.barcodes as Array<{ message: string }>;
    expect(barcodes[0].message).toMatch(/\/w\/11111111-2222-3333-4444-555555555555$/);
    expect(String(pass.webServiceURL)).toMatch(/\/api\/wallet\/apple$/);
  });

  it("states a hold on the face", () => {
    const pass = buildPassJson(cfg, { ...facts, standing: "paused" }, "t");
    const generic = pass.generic as { auxiliaryFields: Array<{ key: string; value: string }> };
    expect(generic.auxiliaryFields.find((f) => f.key === "standing")?.value).toBe("Paused at sea");
  });

  it("derives one authentication token per serial and compares it in constant time", () => {
    const token = passAuthToken(cfg, facts.profileId);
    expect(token).toBe(passAuthToken(cfg, facts.profileId));
    expect(token.length).toBeGreaterThanOrEqual(16);
    expect(passAuthToken(cfg, "other")).not.toBe(token);
    expect(passAuthToken({ keyPem: "different key" }, facts.profileId)).not.toBe(token);
    expect(authTokenMatches(cfg, facts.profileId, token)).toBe(true);
    expect(authTokenMatches(cfg, facts.profileId, token.slice(0, -1) + "x")).toBe(false);
    expect(authTokenMatches(cfg, facts.profileId, null)).toBe(false);
  });

  it("reads only the ApplePass scheme", () => {
    expect(bearerFromHeader("ApplePass abc123")).toBe("abc123");
    expect(bearerFromHeader("applepass abc123")).toBe("abc123");
    expect(bearerFromHeader("Bearer abc123")).toBeNull();
    expect(bearerFromHeader(null)).toBeNull();
  });

  it("writes SHA-1 digests keyed by file name", () => {
    const manifest = JSON.parse(buildManifest({ "pass.json": Buffer.from("{}"), "icon.png": Buffer.alloc(1) })) as Record<string, string>;
    expect(Object.keys(manifest).sort()).toEqual(["icon.png", "pass.json"]);
    expect(manifest["pass.json"]).toBe("bf21a9e8fbc5a3846fb05b4fa0859e0917b2202f");
  });
});

describe.skipIf(!openssl)("the signed .pkpass", () => {
  it("is a ZIP of seven files whose signature verifies against the carried chain", () => {
    const bytes = buildPkpass(config, facts, "11111111-2222-3333-4444-555555555555");
    const file = join(dir, "card.pkpass");
    writeFileSync(file, bytes);

    const listed = spawnSync("unzip", ["-Z1", file], { encoding: "utf8" });
    if (listed.status === 0) {
      expect(listed.stdout.trim().split("\n").sort()).toEqual(
        ["icon.png", "icon@2x.png", "icon@3x.png", "logo.png", "manifest.json", "pass.json", "signature"].sort()
      );
      const out = join(dir, "x");
      expect(spawnSync("unzip", ["-q", "-o", file, "-d", out]).status).toBe(0);
      const verify = spawnSync(
        "openssl",
        ["cms", "-verify", "-inform", "DER", "-in", join(out, "signature"), "-content", join(out, "manifest.json"), "-binary", "-CAfile", join(dir, "wwdr.pem"), "-out", "/dev/null"],
        { encoding: "utf8" }
      );
      expect(verify.status, verify.stderr).toBe(0);
      const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8")) as Record<string, string>;
      expect(Object.keys(manifest).sort()).toEqual(["icon.png", "icon@2x.png", "icon@3x.png", "logo.png", "pass.json"]);
    } else {
      /* No unzip on this host: the archive is at least well-formed. */
      expect(bytes.readUInt32LE(0)).toBe(0x04034b50);
      expect(bytes.readUInt32LE(bytes.length - 22)).toBe(0x06054b50);
    }
  });
});
