/* The pass icon, as bytes.

   A .pkpass must carry icon.png or Wallet refuses it, and the file is read on a
   serverless host where nothing outside the bundle is guaranteed to exist at
   request time — public/ is served by the CDN, not by the function. So the
   bytes of public/icons/icon-192.png are inlined here, once, and the same
   raster serves icon.png, icon@2x.png, icon@3x.png and logo.png. Wallet scales
   them; the sizes it names (29, 58, 87 pt) are targets, not requirements.

   Generated from public/icons/icon-192.png. Regenerate rather than edit:
     node -e "console.log(require("fs").readFileSync("public/icons/icon-192.png").toString("base64"))" */
const ICON_BASE64 = [
  "iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAIAAADdvvtQAAANB0lEQVR4nO3deVQT1x4H8CFJwxIQN0QFcfdZN0Tx4YoihUpR",
  "iyha3IXqa11q66OoT+qx2tatxR7rVqliEUWRgigqYq1SVOpzBRWpa1EWEcEqhARIyDst51AeZINfkpqb7+f4j3NvZu7xfL0z",
  "c2fuHbPmrdtyAE3Fa/IvARAgoEKAgAQBAhIECEgQICBBgIAEAQISBAhIECAgQYCABAECEgQISBAgIEGAgAQBAhIECEgQICBB",
  "gIAEAQISBAhIECAgQYCABAECEgQISBAgIEGAgAQBAhIECEgQICBBgIAEAQISBAhIECAgQYCABAECEgQISBAgIEGAgAQBAhIE",
  "CEgQICBBgIAEAQISBAhIECAgEdB+zo4WzW0HuvRz6d+3W5dOHRwd2tm3sbSysLSwlMlkEqmktEycn/8k53HunbsPLl/NyLx5",
  "u7Ky8u9u8ivBzMS/F2bfxs5//Ftveo0a0L8vj6dtfyyRSE+fTTtyLCXldKpMJuNMmOkGyHWA87+CZ3h5jhTw+U3eSeHTol3f",
  "x0Qf+OHly9J6RWZmZomxewb071u7xWPMxLv3H3JsMcUA/aNHt7DQxR4jh+lqh+Ly8oNxiTu+i8ovKKzdGBjgt/GLlXWreY2b",
  "cjv7LscW0wqQUCj8cMHc+fNmCQS6v/irqKiMiIzesiOyTCy2tW2WdupwyxbN61bw8Zt641Y2xxYTuohu384+YsuXzv16q6pQ",
  "UVGZfvFy6rn0S1cynhUXPysuqa5WWIusmjWz6dq5U49uXYYNGTR0sKtQKFT6c3Nz4cL3gt4J8Pvy6+19e79eLz1//FvrIbV/",
  "O1Ppgfr27hm9e2urli2UlkqlFXtj4rZF7CkqKla/HytLywD/cfOCpnd0cmxsGya8E3TpynWOLSYxDuQ6wDl2705V6bmZle3p",
  "G/DpF19pTA/HceUSyff7Yt29/VavDS+XSBrVDCZ7IPYD1L1r56iIzTY21kpL4xOPjw+YnfMot1H7lMurd+6OfsN38q3bv2r/",
  "K8rt3iuL8QA1t7WN2vVNs2Y2SkuTU858tHRlk4cEHz3Oe3vy7ORTZ7SsL3gNPZCxWbfmPx0c2istupmVvWDJcrm8mrJ/qbTi",
  "vUWhSSdOaVMZPZCRGevjNdbHS2mRQqFYsWpdRYUOHkfI5PIPQj65fDVDY02+AAEyHkKh8D+hH6gqTTrx45Vrmbo6VmVl5dwF",
  "ISXPf1df7TVcRBuRwAA/J0cHVaUJR47r9nBFz4pXrw1XX4fPR4CMx6zpk1UVSSTS1HPpOj9iXEJS2oWLaiq8hotoY+Hi3KdH",
  "ty6qSh89ztXJ1U9Dyz75XCqt4FTARbTR8PQYoaa0sOiZno6b8yg3+sAPqkoxkGg0hroNUlNaVibW36G/27NP1dCAAHdhxqJn",
  "j65qSq2tRfo7dG5ewbHkH5UWoQcyDq1btVQ19FzD1kZdKd23u/cq3S7AXZhRaG7bTH2FLl06mZmZ6a8BGZm3lL73g4FE42Al",
  "slJfwcZa1KljB722ITEpueFGDCQaB21u0UcMddNrG44cO6lQKOptRA9kHBq+397QRD9fvbYhv6Dw0pX6T8fQAxmHFy9eaqwz",
  "0KVfv7699NqMo8dP1tvCx0CiUSiXSCQSqcZqq8M+1mszTv30c70teJRhNLSZ/FAzL0x/bcjNK/j1zr26W/Aw1Whcz7ypTbUV",
  "oYs9R6l76EH045m0un/FNZDRuHr9hjbVeDxexNaNPt6jDXMW47N4F8bmtB5rkehqeoqVpaU2laurq9eHb90e8X11Nen1VtPE",
  "Zg9UJhYnHlUylKcUj8dbHrLo0L6Izp2c9NwuBrEZII7j9qp+rUIpN1eXMyfiPl+1zK51K701ikFsnsJq7Ni8XtVL9WpUVFTG",
  "JSRFREbfe/CbftrFFJYDZNe61dnkH2w1PVtVSqFQnD57bufu6Au/XNJD09jBcoA4jvMb57Ml/HPKHh48zImJPXwo4eiz4hLd",
  "tYsdjAeI47hF7wcvXbKAuBOZTJZyOnXfwfi08xdxs2ZaAeI47tOwkOBZU3Wyq8d5+TGxCQfjjhQ+LdLJDo2dSQSoph8K/Wi+",
  "rt4jk8nlp8+k7TsYf/bnCybeIZlKgDiOG+PtsfnLz7QcXdRSXv6TmNiEqP2HNE5LZZUJBYjjuE4dO2z4LGzoYHVzNppAIpHu",
  "j43f8d3egid/rZFoIkwrQDUCJ08IC13ctNt7NWQy2b6D8eGbvy0uec6ZDFMMUM1r0UEzA+cGTWtua6vbPZeWibft3BMRGa1m",
  "iipLTDRANaxFopnTAubMmNKurb1u95zzKPfD0JXsrYjYkEkHqIaAz3/Ty2NG4KRhQwbpcLpPdXX1jl17N27aVlVVxbELAfpL",
  "RyfHwAC/AP9x9m3sdLXPaxk3ZwQv+v3FC45RCFB9fD5vxLDBk/x8x3iNtrAwp+/wzt37gbPnszrwiACpZC0S+Y7xnOjnO8TN",
  "lXhqe5yXP2FK0JPCpxxzECDNHB3a+b/91mT/8ZT5rJk3svynBrN3a4YANcKggf2nTHp73FteIisNs6eViow68MmaDRxbEKBG",
  "s7EWBc+aOi9ouvo1QBpSKBSTpr578fI1jiEIUBPZ2Fh//OH7c2a806jLo4zMW74T9TgZzfCYfSda30pLy1au2Tg9aOHTxiyY",
  "59yv9+hRwzmGIEAkqefSxwfMevQ4T/ufzJk+hWMIAkSVm1fgHxj8W85jLeu7Dx+i8wdwfyMESAeeFD6duzBEy6WD+XzeKPeh",
  "HCsQIN24nX1X40r1tQa69ONYwVSAli5ZkHv3au2fMd4ehjx61P5DmTdva1Ozb++eHCuYClC9k4heV95oSKFQrP9qizY1nTqo",
  "/IiH0WEqQPU+Hec5arheV2NtKPVcujadUOtWLZn57AFTAZL+fw/Uxq71oIHOBm5DXEKSxjo8Hs/S0oJjAlMBavjxynE+3gZu",
  "Q2JScsP1WRuysECAXj0VDQPk623gk0VxyfP7D3M0VpPL5RwTGO+BWrdqafhHB9czNC+wVyYu55jAeA9UM4nHwM24p2ldmKqq",
  "qiZ/KvpVw1aAlI0Fe44abuDb5heaFqrOacyzs1ccUwFS+t+ax+MFzwo0ZDNelmpYKv+BFhdJxoKpAKl6GjVtykQ7O8MtXGel",
  "afr9zSzNy1gbC6YCpOrCwsLCfNF7QQZrhq2mSdPn09lZ9YzlgcS6Zk6b3KO7us8Y6pCt2lddy8RiLZexNgpMBUjNrY2Az1/7",
  "6XLDPNnorHa54KPHUliaq2oqAfpjId9BAwxzNe06QN3zkwNxiRxDmAqQxle6lod88HrP7nptg6NDu7b2bVSVXrx09cq1TI4h",
  "TAVI4+icublw1/bwFs31+EbpeN831ZRuCN/KscVULqJrOTk67NyyUSgU6qMBAj5/zgyV78wfTkpmbFIYawGqqqrS5kn4EDfX",
  "b7/ZoI+vuE/081W11FBRUXHYqvUcc5gK0J9nMa1ucLxGu0fu2NS0GcqqODk6rFoRorRIJpcvClnB5CIv7AVI24eUHiOHJRzc",
  "ravHZEKhcOvXa21srJWWhq1ad+7CfzkWsRYgpQ/kVenVs0fK0QOT/ccTD2otEu3Z+bWLcx+lpRs2bY1u5KeDjAhzAdJuclYt",
  "a5EofP2q+JjdTf6Is5urS3Lifvdhg5WWrlm3afO2XRy7WFtcIe3U4YYDwb+/eKHNZNC0Cxcjow78lHpeJpNprGxmZjbEzfXd",
  "2VO9PUcqrVAukSxZuirpxCmOaQLme6Dikufu3hPe8Bix7N8L1a/GOmKo24ihbmVi8fn0S5euXL9z78GDhzkvX5aWicvlcpm5",
  "0NzWtplD+7Y9und1+XONBHvVSyneuffg/cXL6n21mUms9UDH46PrnYw+XrEmJjahZhQxMMBv/rw57dvpeFHfumRy+fadezZt",
  "iWDmnUPTClB8zO5/uvav/Wvmjayxk2bW/R6KQCAY6+MVPCtQ1TVvkykUiuMnT28I33b/oQl96pC1U1jd//cKhSJs9fp6X9OR",
  "yWSHj544fPREn149A/zH+o3zadWyBfGg5RJJYtLJyKgDWdl3OBPDWg/UWAI+f4ibq5en+xse7o0dExKXl/987peU06nJKT+V",
  "lok5k2TqAarLvo2dS/8+zn16dero5OTY3t7eTmRlZWn1x/upUqlUIpGWlDzPzS/IzSvIyr6TkZmV/etdGSvTu5oMAQIS1gYS",
  "wcAQICBBgIAEAQISBAhIECAgQYCABAECEgQISBAgIEGAgAQBAhIECEgQICBBgIAEAQISBAhIECAgQYCABAECEgQISBAgIEGA",
  "gAQBAhIECEgQICBBgMCEl3c5GKrHpaIMZsqGQs5ooQcCEgQISLC8C5CgBwISBAhIECAgQYCABAECEgQISBAgIEGAgAQBAhIE",
  "CEgQICBBgIAEAQISBAhIECAgQYCABAECEgQISBAgIEGAgAQBAhIECEgQICBBgIAEAQISBAhIECDgKP4HyOsaB4Pdq4IAAAAA",
  "SUVORK5CYII=",
].join("");

export function passIconBytes(): Buffer {
  return Buffer.from(ICON_BASE64, "base64");
}
