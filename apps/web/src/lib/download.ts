export function downloadSvg(svg: string, filename: string) {
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".svg") ? filename : `${filename}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadPng(url: string, filename: string) {
  const response = await fetch(resolveApiAssetUrl(url));
  if (!response.ok) {
    throw new Error(`Failed to download PNG: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("image/png")) {
    throw new Error(`Expected image/png but received ${contentType || "unknown content type"}`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

export function downloadZip(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".zip") ? filename : `${filename}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function resolveApiAssetUrl(input: string): string {
  if (/^https?:\/\//i.test(input)) return input;
  const base = (import.meta.env.VITE_API_BASE_URL || "http://localhost:3001").replace(/\/$/, "");
  return `${base}${input.startsWith("/") ? "" : "/"}${input}`;
}
