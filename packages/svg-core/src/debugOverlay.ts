type DebugOverlayLayout = {
  layers?: Array<{
    id?: unknown;
    bounds?: {
      x?: unknown;
      y?: unknown;
      w?: unknown;
      h?: unknown;
    };
  }>;
};

export function generateDebugOverlay(layoutBlueprint: DebugOverlayLayout, svg: string): string {
  if (!layoutBlueprint || !layoutBlueprint.layers || !Array.isArray(layoutBlueprint.layers)) {
    throw new Error("layoutBlueprint must have a layers array");
  }

  // Extract SVG dimensions from the input SVG
  const viewBoxMatch = svg.match(/viewBox\s*=\s*["']([^"']+)["']/i);
  const widthMatch = svg.match(/<svg\b[^>]*\bwidth\s*=\s*["']([^"']+)["']/i);
  const heightMatch = svg.match(/<svg\b[^>]*\bheight\s*=\s*["']([^"']+)["']/i);

  let canvasWidth = 800;
  let canvasHeight = 600;

  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].trim().split(/\s+/).map(Number);
    if (
      parts.length === 4 &&
      Number.isFinite(parts[2]) &&
      Number.isFinite(parts[3]) &&
      parts[2] > 0 &&
      parts[3] > 0
    ) {
      canvasWidth = parts[2];
      canvasHeight = parts[3];
    }
  } else if (widthMatch && heightMatch) {
    const parsedWidth = parseFloat(widthMatch[1]);
    const parsedHeight = parseFloat(heightMatch[1]);
    if (Number.isFinite(parsedWidth) && parsedWidth > 0) {
      canvasWidth = parsedWidth;
    }
    if (Number.isFinite(parsedHeight) && parsedHeight > 0) {
      canvasHeight = parsedHeight;
    }
  }

  const overlays: string[] = [];

  // Canvas border
  overlays.push(
    `<rect x="0" y="0" width="${canvasWidth}" height="${canvasHeight}" fill="none" stroke="red" stroke-width="2" />`
  );

  // Safe area lines (10% margin)
  const safeMarginX = canvasWidth * 0.1;
  const safeMarginY = canvasHeight * 0.1;
  overlays.push(
    `<rect x="${safeMarginX}" y="${safeMarginY}" width="${canvasWidth - safeMarginX * 2}" height="${canvasHeight - safeMarginY * 2}" fill="none" stroke="cyan" stroke-width="1" stroke-dasharray="5,5" />`
  );

  for (const layer of layoutBlueprint.layers) {
    if (!layer.id || !layer.bounds) continue;

    const toNumber = (value: unknown): number => {
      if (typeof value === "number") return value;
      if (typeof value === "string") {
        const n = parseFloat(value);
        return Number.isFinite(n) ? n : NaN;
      }
      return NaN;
    };

    const x = toNumber(layer.bounds.x);
    const y = toNumber(layer.bounds.y);
    const w = toNumber(layer.bounds.w);
    const h = toNumber(layer.bounds.h);

    if (![x, y, w, h].every(Number.isFinite)) continue;

    const pxX = (x / 100) * canvasWidth;
    const pxY = (y / 100) * canvasHeight;
    const pxW = (w / 100) * canvasWidth;
    const pxH = (h / 100) * canvasHeight;

    if (![pxX, pxY, pxW, pxH].every(Number.isFinite)) continue;

    // Bounding box
    overlays.push(
      `<rect x="${pxX}" y="${pxY}" width="${pxW}" height="${pxH}" fill="none" stroke="yellow" stroke-width="1.5" opacity="0.8" />`
    );

    // Layer ID label
    overlays.push(
      `<text x="${pxX + 4}" y="${pxY + 16}" fill="yellow" font-size="12" font-family="monospace" opacity="0.9">${String(layer.id).replace(/</g, "&lt;")}</text>`
    );

    // Landmark points (corners + center)
    const landmarks = [
      { cx: pxX, cy: pxY },
      { cx: pxX + pxW, cy: pxY },
      { cx: pxX + pxW, cy: pxY + pxH },
      { cx: pxX, cy: pxY + pxH },
      { cx: pxX + pxW / 2, cy: pxY + pxH / 2 },
    ];

    for (const lm of landmarks) {
      overlays.push(
        `<circle cx="${lm.cx}" cy="${lm.cy}" r="3" fill="red" opacity="0.7" />`
      );
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}">${overlays.join("")}</svg>`;
}
