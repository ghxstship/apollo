import { describe, expect, it } from "vitest";
import { crc32, zipStore } from "../zip";

describe("zip", () => {
  it("computes the standard CRC-32 check value", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });

  it("writes a stored archive with a central directory and end record", () => {
    const zip = zipStore([
      { name: "a.txt", data: Buffer.from("alpha") },
      { name: "b/c.json", data: Buffer.from("{}") },
    ]);
    /* local header, central header, end-of-central-directory signatures */
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    const eocd = zip.length - 22;
    expect(zip.readUInt32LE(eocd)).toBe(0x06054b50);
    expect(zip.readUInt16LE(eocd + 10)).toBe(2);
    const centralOffset = zip.readUInt32LE(eocd + 16);
    expect(zip.readUInt32LE(centralOffset)).toBe(0x02014b50);
    /* the first local header's CRC is the payload's */
    expect(zip.readUInt32LE(14)).toBe(crc32(Buffer.from("alpha")));
    /* same input, same bytes */
    expect(zipStore([{ name: "a.txt", data: Buffer.from("alpha") }, { name: "b/c.json", data: Buffer.from("{}") }]).equals(zip)).toBe(true);
  });
});
