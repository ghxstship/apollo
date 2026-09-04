/* The slice of node-forge this module uses, typed by hand.

   node-forge ships no types of its own and the permitted dependency budget for
   wallet signing was exactly one package, so @types/node-forge is not added.
   Only the PKCS#7 detached-signature path is declared: certificates and a
   private key in from PEM, a SignedData built, signed, and serialised to DER.
   Anything else forge can do is deliberately not reachable from here. */
declare module "node-forge" {
  export interface ForgeByteBuffer {
    getBytes(): string;
  }

  export interface ForgeCertificate {
    readonly __brand?: "forge-certificate";
  }

  export interface ForgePrivateKey {
    readonly __brand?: "forge-private-key";
  }

  export interface ForgeSigner {
    key: ForgePrivateKey;
    certificate: ForgeCertificate;
    digestAlgorithm: string;
    authenticatedAttributes: Array<{ type: string; value?: string }>;
  }

  export interface ForgeSignedData {
    content: ForgeByteBuffer;
    addCertificate(certificate: ForgeCertificate | string): void;
    addSigner(signer: ForgeSigner): void;
    sign(options?: { detached?: boolean }): void;
    toAsn1(): unknown;
  }

  export const util: {
    createBuffer(input: string, encoding?: "raw" | "utf8"): ForgeByteBuffer;
  };

  export const pki: {
    certificateFromPem(pem: string): ForgeCertificate;
    privateKeyFromPem(pem: string): ForgePrivateKey;
    /* Returns null when the passphrase is wrong or the PEM is not encrypted. */
    decryptRsaPrivateKey(pem: string, passphrase: string): ForgePrivateKey | null;
    oids: Record<string, string>;
  };

  export const asn1: {
    toDer(object: unknown): ForgeByteBuffer;
  };

  export const pkcs7: {
    createSignedData(): ForgeSignedData;
  };

  const forge: {
    util: typeof util;
    pki: typeof pki;
    asn1: typeof asn1;
    pkcs7: typeof pkcs7;
  };
  export default forge;
}
