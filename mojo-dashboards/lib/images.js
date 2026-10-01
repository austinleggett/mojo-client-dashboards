// Shared rules for images on dashboards. Images are uploaded once
// (POST /api/clients/<slug>/images), stored in the ClientImage table,
// and referenced everywhere by their own short URL, /api/images/<id>
// -- never embedded in the page content itself, so a dashboard with a
// dozen screenshots still loads and saves quickly.
//
// The only image sources ever allowed in saved content are those
// URLs: no outside images (which could track viewers or disappear)
// and no inline data: blobs (which would bloat the page).

export const IMG_CLASS = "rt-img";
export const IMG_SIZES = ["img-sm", "img-md", "img-full"];
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // after client-side resizing

const OWN_IMAGE = /^(?:https?:\/\/(?:www\.)?mountainmojostudios\.com)?\/api\/images\/([A-Za-z0-9_-]{8,64})$/;

// Returns the canonical relative URL for one of our own images, or null.
export function safeImageSrc(src) {
  const m = OWN_IMAGE.exec(String(src || "").trim());
  return m ? `/api/images/${m[1]}` : null;
}

// Browser-only: shrinks an image file to at most `maxDim` pixels on its
// long side and returns a data: URL ready to upload. Screenshots stay
// crisp PNGs when that's a reasonable size; anything heavier becomes a
// high-quality JPEG. Animated GIFs are sent as-is (resizing would
// flatten them) as long as they're under the size limit.
export function fileToUploadDataUrl(file, maxDim = 1600) {
  return new Promise((resolve, reject) => {
    if (!file || !ALLOWED_IMAGE_TYPES.includes(file.type)) {
      reject(new Error("Use a PNG, JPG, WebP or GIF image."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      if (file.type === "image/gif") {
        if (file.size > MAX_IMAGE_BYTES) reject(new Error("That GIF is too large (3 MB max)."));
        else resolve(reader.result);
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error("Couldn't read that image."));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        let out = canvas.toDataURL("image/png");
        if (out.length > 1.6 * 1024 * 1024) {
          // Too heavy as PNG (usually a photo): JPEG on a white background.
          const c2 = document.createElement("canvas");
          c2.width = w;
          c2.height = h;
          const x2 = c2.getContext("2d");
          x2.fillStyle = "#ffffff";
          x2.fillRect(0, 0, w, h);
          x2.drawImage(canvas, 0, 0);
          out = c2.toDataURL("image/jpeg", 0.86);
        }
        resolve(out);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Browser-only: upload a file to a client and get back its image URL.
export async function uploadImage(slug, file) {
  const dataUrl = await fileToUploadDataUrl(file);
  const res = await fetch(`/api/clients/${slug}/images`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Upload failed.");
  return body.url;
}
