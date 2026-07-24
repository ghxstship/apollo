import QRCode from "qrcode";

/* Boarding-stub and member-card QR — bone modules on a transparent ground,
   sized for the dark card faces. Render as <img alt="Boarding code" />. */
export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    margin: 1,
    color: { dark: "#F2F2F4", light: "#00000000" },
  });
}
