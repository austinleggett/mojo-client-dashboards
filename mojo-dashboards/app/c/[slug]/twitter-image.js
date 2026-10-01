import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";

// The link-preview image (Slack, iMessage, email, LinkedIn...) for a
// client's dashboard link: the same look as the dashboard's header --
// the client's brand-color gradient with the mountain silhouette --
// with the client's logo on its swatch, their name, and "Client
// Dashboard · Mountain Mojo Group". Inactive or unknown links get a
// plain Mountain Mojo card instead, so nothing about a retired client
// leaks into a preview.
export const runtime = "nodejs";
export const alt = "Client dashboard by Mountain Mojo Group";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 300;

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || "").trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}
function darken(hex, amt) {
  const rgb = hexToRgb(hex) || [31, 77, 58];
  return `rgb(${rgb.map((c) => Math.round(c * (1 - amt))).join(",")})`;
}
const plain = (html) =>
  String(html || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .trim();
// Satori renders PNG/JPEG data URIs; anything else (SVG, WebP...) is skipped.
const usableImage = (src) => typeof src === "string" && /^data:image\/(png|jpe?g);base64,/i.test(src);

const MOUNTAINS =
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="400" viewBox="0 0 380 200"><path d="M0 200 L95 70 L190 200 Z" fill="rgba(253,253,249,0.5)"/><path d="M80 200 L200 30 L320 200 Z" fill="rgba(253,253,249,0.65)"/><path d="M180 200 L275 85 L380 200 Z" fill="rgba(253,253,249,0.8)"/></svg>`
  ).toString("base64");

// The dashboard's heading font, bold, for the client name. Fetched from
// Google Fonts; if that fails for any reason the image still renders
// with the built-in font.
async function loadBoldFont() {
  try {
    const css = await fetch("https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@800", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/534.30 (KHTML, like Gecko) Safari/534.30" },
      signal: AbortSignal.timeout(2500),
    }).then((r) => r.text());
    const url = /src: url\(([^)]+)\) format\('(truetype|opentype)'\)/.exec(css)?.[1];
    if (!url) return null;
    return await fetch(url, { signal: AbortSignal.timeout(2500) }).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export default async function OpengraphImage({ params }) {
  const bold = await loadBoldFont();
  const client = await prisma.client.findUnique({ where: { slug: params.slug } }).catch(() => null);
  const ok = client && client.active;
  const meta = (ok && client.content && client.content.meta) || {};
  const accent = (ok && client.accentColor) || "#1f4d3a";
  const name = ok ? plain(meta.clientName) || client.name : "Mountain Mojo Group";
  const logo = ok && usableImage(meta.clientLogo) ? meta.clientLogo : null;
  const logoBg = /^#[0-9a-f]{6}$/i.test(meta.clientLogoBg || "") ? meta.clientLogoBg : "#fdfdf9";
  const initial = (name || "M").trim().charAt(0).toUpperCase();
  const fontSize = name.length > 28 ? 58 : name.length > 18 ? 70 : 82;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: `linear-gradient(135deg, ${accent} 0%, ${darken(accent, 0.28)} 100%)`,
          color: "#fdfdf9",
          fontFamily: bold ? "Libre Franklin, sans-serif" : "sans-serif",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={MOUNTAINS} width={760} height={400} style={{ position: "absolute", right: -40, bottom: -30, opacity: 0.16 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 56, padding: "0 80px", width: "100%" }}>
          <div
            style={{
              width: 280,
              height: 280,
              borderRadius: 40,
              background: logoBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 26,
              boxShadow: "0 18px 50px rgba(0,0,0,0.28)",
              border: "3px solid rgba(253,253,249,0.28)",
              flexShrink: 0,
            }}
          >
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
              <img src={logo} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            ) : (
              <div style={{ fontSize: 130, fontWeight: 800, color: darken(accent, 0.28) }}>{initial}</div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
            <div style={{ fontSize, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1 }}>{name}</div>
            <div
              style={{
                marginTop: 18,
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: 3,
                textTransform: "uppercase",
                color: "rgba(253,253,249,0.72)",
              }}
            >
              {ok ? "Client Dashboard" : "Client Dashboards"}
            </div>
            <div style={{ marginTop: 34, display: "flex", alignItems: "center", gap: 14, fontSize: 26, color: "rgba(253,253,249,0.85)" }}>
              <div style={{ width: 46, height: 5, borderRadius: 3, background: "rgba(253,253,249,0.7)" }} />
              Mountain Mojo Group
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: bold ? [{ name: "Libre Franklin", data: bold, weight: 800, style: "normal" }] : undefined }
  );
}
