export interface NormalizedBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PixelBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function normalizedToPixel(
  bounds: NormalizedBounds,
  canvasWidth: number,
  canvasHeight: number
): PixelBounds {
  return {
    x: (bounds.x / 100) * canvasWidth,
    y: (bounds.y / 100) * canvasHeight,
    w: (bounds.w / 100) * canvasWidth,
    h: (bounds.h / 100) * canvasHeight,
  };
}

export function pixelToNormalized(
  bounds: PixelBounds,
  canvasWidth: number,
  canvasHeight: number
): NormalizedBounds {
  return {
    x: (bounds.x / canvasWidth) * 100,
    y: (bounds.y / canvasHeight) * 100,
    w: (bounds.w / canvasWidth) * 100,
    h: (bounds.h / canvasHeight) * 100,
  };
}
