/** Prefer the SVG coordinate system to the browser's 300 px fallback viewport. */
export function svgSize(width: string | null, height: string | null, viewBox: string | null): { width: number; height: number; scale: number } {
  const px = (s: string | null) => s && /^\d+(?:\.\d+)?(?:px)?$/.test(s.trim()) ? parseFloat(s) : 0;
  const box = (viewBox || "").trim().split(/[\s,]+/).map(Number);
  const ratio = box.length === 4 && box.every(Number.isFinite) && box[2]! > 0 && box[3]! > 0 ? box[2]! / box[3]! : 0;
  let w = px(width), h = px(height);
  if (!w && !h && ratio) { w = box[2]!; h = box[3]!; }
  else if (ratio) { if (!w) w = h * ratio; if (!h) h = w / ratio; }
  w = Math.ceil(w || 1200); h = Math.ceil(h || 800);
  if (w * h > 16000000 || w > 8000 || h > 8000) throw new Error("SVG resolution exceeds the image limit.");
  return { width: w, height: h, scale: Math.min(2, 8000 / w, 8000 / h, Math.sqrt(16000000 / (w * h))) };
}
