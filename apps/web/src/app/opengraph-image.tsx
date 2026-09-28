import { ImageResponse } from "next/og";
import { productName } from "~/site";

export const alt = `${productName}: let a small model make the call, and know when it should not.`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The image renderer reads sRGB only, so these are the light theme tokens from global.css
// (OKLCH) converted to sRGB.
const paper = "rgb(248, 245, 240)";
const ink = "rgb(37, 30, 22)";
const ink3 = "rgb(107, 97, 87)";
const signal = "rgb(249, 173, 38)";

/** The display face, fetched at build time. Falls back to the renderer's default face offline. */
async function loadDisplayFont(): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch("https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@600&display=swap", {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; bandwise-og)" },
      })
    ).text();
    const url = /src: url\(([^)]+)\) format\('(?:truetype|opentype)'\)/.exec(css)?.[1];
    if (url === undefined) return null;
    return await (await fetch(url)).arrayBuffer();
  } catch {
    return null;
  }
}

// The log-line pager bands: 0 to 0.2 high, 0.2 to 0.3 medium, 0.3 to 0.7 low, 0.7 to 0.8 medium, 0.8 to 1 high.
const bands: Array<{ w: number; kind: "high" | "medium" | "low" }> = [
  { w: 0.2, kind: "high" },
  { w: 0.1, kind: "medium" },
  { w: 0.4, kind: "low" },
  { w: 0.1, kind: "medium" },
  { w: 0.2, kind: "high" },
];

export default async function Image() {
  const font = await loadDisplayFont();
  const rulerWidth = 1040;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: paper,
          color: ink,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          ...(font ? { fontFamily: "Display" } : {}),
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 40 }}>
          <div style={{ width: 40, height: 40, border: `3px solid ${ink}`, display: "flex", flexDirection: "column" }}>
            <div style={{ height: 13, background: signal, borderBottom: `3px solid ${ink}` }} />
          </div>
          {productName}
        </div>
        <div style={{ display: "flex", fontSize: 86, lineHeight: 1.02, letterSpacing: -1, maxWidth: 980 }}>
          Let a small model make the call. Know when it should not.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", width: rulerWidth, height: 56, border: `3px solid ${ink}` }}>
            {bands.map((b, i) => (
              <div
                key={i}
                style={{
                  width: (rulerWidth - 6) * b.w,
                  height: "100%",
                  borderRight: i < bands.length - 1 ? `2px solid ${ink}` : "none",
                  background: b.kind === "high" ? signal : b.kind === "medium" ? "rgb(252, 217, 153)" : paper,
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", width: rulerWidth, fontSize: 26, color: ink3 }}>
            <span>no</span>
            <span>unsure, a person decides</span>
            <span>yes</span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: font ? [{ name: "Display", data: font, style: "normal", weight: 600 }] : [],
    },
  );
}
