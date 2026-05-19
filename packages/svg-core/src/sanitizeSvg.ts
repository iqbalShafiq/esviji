const ALLOWED_ELEMENTS = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "defs",
  "lineargradient",
  "radialgradient",
  "stop",
  "clippath",
  "mask",
  "filter",
  "feturbulence",
  "fecolormatrix",
  "feblend",
  "fegaussianblur",
  "feoffset",
]);

const BLOCKED_ELEMENTS = new Set([
  "script",
  "foreignobject",
  "iframe",
  "image",
  "style",
  "link",
  "object",
  "embed",
]);

const BLOCKED_ATTRIBUTES_REGEX = /^on/i;
const EXTERNAL_URL_REGEX = /^(https?:|data:|javascript:|file:|ftp:)/i;
const HREF_ATTRIBUTES = new Set(["href", "xlink:href", "src"]);

export function sanitizeSvg(svg: string): string {
  if (!svg || typeof svg !== "string") {
    return "";
  }

  let sanitized = svg;

  // Remove DOCTYPE declarations
  sanitized = sanitized.replace(/<!DOCTYPE\s[^>]*>/gi, "");

  // Remove CDATA sections (potential script hiding)
  sanitized = sanitized.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");

  // Remove XML comments
  sanitized = sanitized.replace(/<!--[\s\S]*?-->/g, "");

  // Process tags: remove blocked elements and strip bad attributes
  const tagRegex = /<(\/?)([a-zA-Z][a-zA-Z0-9\-]*)([^>]*)>/g;
  const resultParts: string[] = [];
  let lastIndex = 0;
  let match;

  while ((match = tagRegex.exec(sanitized)) !== null) {
    const isClosing = match[1] === "/";
    const tagName = match[2].toLowerCase();
    const fullMatch = match[0];
    const matchIndex = match.index;

    resultParts.push(sanitized.slice(lastIndex, matchIndex));

    if (BLOCKED_ELEMENTS.has(tagName)) {
      if (!isClosing) {
        const closeRegex = new RegExp(`<\\/${tagName}\\s*>`, "gi");
        const closeMatch = closeRegex.exec(sanitized);
        if (closeMatch && closeMatch.index > matchIndex) {
          tagRegex.lastIndex = closeMatch.index + closeMatch[0].length;
        } else {
          tagRegex.lastIndex = matchIndex + fullMatch.length;
        }
        lastIndex = tagRegex.lastIndex;
      } else {
        lastIndex = matchIndex + fullMatch.length;
      }
      continue;
    }

    if (!ALLOWED_ELEMENTS.has(tagName)) {
      if (!isClosing) {
        const closeRegex = new RegExp(`<\\/${tagName}\\s*>`, "gi");
        const closeMatch = closeRegex.exec(sanitized);
        if (closeMatch && closeMatch.index > matchIndex) {
          tagRegex.lastIndex = closeMatch.index + closeMatch[0].length;
        }
        lastIndex = tagRegex.lastIndex;
      } else {
        lastIndex = matchIndex + fullMatch.length;
      }
      continue;
    }

    if (!isClosing) {
      // Strip bad attributes
      let cleanedTag = `<${tagName}`;
      const attrRegex =
        /\s+([a-zA-Z_:][a-zA-Z0-9_:.\-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*))|(\s+[a-zA-Z_:][a-zA-Z0-9_:.\-]*)(?=\s|>|\/>)/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(fullMatch)) !== null) {
        const attrName = attrMatch[1] || attrMatch[5];
        const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";

        if (!attrName) continue;
        const lowerAttrName = attrName.toLowerCase();

        if (BLOCKED_ATTRIBUTES_REGEX.test(lowerAttrName)) {
          continue;
        }

        if (HREF_ATTRIBUTES.has(lowerAttrName)) {
          if (EXTERNAL_URL_REGEX.test(attrValue.trim())) {
            continue;
          }
        }

        if (attrValue) {
          cleanedTag += ` ${attrName}="${attrValue.replace(/"/g, "&quot;")}"`;
        } else {
          cleanedTag += ` ${attrName}`;
        }
      }

      if (fullMatch.trim().endsWith("/>")) {
        cleanedTag += " />";
      } else {
        cleanedTag += ">";
      }

      resultParts.push(cleanedTag);
    } else {
      resultParts.push(`</${tagName}>`);
    }

    lastIndex = matchIndex + fullMatch.length;
  }

  resultParts.push(sanitized.slice(lastIndex));

  return resultParts.join("").trim();
}
