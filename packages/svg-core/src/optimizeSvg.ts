import { optimize, type Config } from "svgo";

export interface OptimizeResult {
  optimizedSvg: string;
  sizeBeforeBytes: number;
  sizeAfterBytes: number;
}

const PRESERVE_IDS: string[] = [
  "background",
  "base-shape",
  "primary-object",
  "symbol",
  "accent",
  "shadow",
  "texture",
];

const PRESERVE_PREFIXES: string[] = ["layer-"];

export async function optimizeSvg(svg: string): Promise<OptimizeResult> {
  const sizeBeforeBytes = Buffer.byteLength(svg, "utf8");

  const config: Config = {
    multipass: true,
    plugins: [
      {
        name: "preset-default",
        params: {
          overrides: {
            cleanupIds: {
              preserve: PRESERVE_IDS,
              preservePrefixes: PRESERVE_PREFIXES,
            },
          },
        },
      },
    ],
  };

  const result = optimize(svg, config);
  const optimizedSvg = result.data;
  const sizeAfterBytes = Buffer.byteLength(optimizedSvg, "utf8");

  return {
    optimizedSvg,
    sizeBeforeBytes,
    sizeAfterBytes,
  };
}
