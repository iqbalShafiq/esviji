import { Resvg } from "@resvg/resvg-js";

export async function renderSvg(
  svg: string,
  width?: number,
  height?: number
): Promise<Buffer> {
  let fitTo:
    | { mode: "original" }
    | { mode: "width"; value: number }
    | { mode: "height"; value: number }
    | { mode: "zoom"; value: number };

  if (width && height) {
    // Both provided - fit to width (primary dimension)
    fitTo = { mode: "width", value: width };
  } else if (width) {
    fitTo = { mode: "width", value: width };
  } else if (height) {
    fitTo = { mode: "height", value: height };
  } else {
    fitTo = { mode: "original" };
  }

  const resvg = new Resvg(svg, {
    fitTo,
  });

  const pngData = resvg.render();
  return pngData.asPng();
}
