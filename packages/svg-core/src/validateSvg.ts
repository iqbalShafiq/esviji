export interface SvgValidationResult {
  valid: boolean;
  sanitizedSvg: string;
  errors: string[];
  warnings: string[];
}

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

function sanitizeAttributes(
  tag: string,
  tagName: string,
  errors: string[],
  _warnings: string[]
): string {
  // Match all attributes: name="value" or name='value' or name=value or boolean attributes
  const attrRegex =
    /\s+([a-zA-Z_:][a-zA-Z0-9_:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*))|(\s+[a-zA-Z_:][a-zA-Z0-9_:.-]*)(?=\s|>|\/>)/g;
  let sanitizedTag = `<${tagName}`;
  let match;

  while ((match = attrRegex.exec(tag)) !== null) {
    const attrName = match[1] || match[5];
    const attrValue = match[2] ?? match[3] ?? match[4] ?? "";

    if (!attrName) continue;

    const lowerAttrName = attrName.toLowerCase();

    if (BLOCKED_ATTRIBUTES_REGEX.test(lowerAttrName)) {
      errors.push(`Blocked event handler attribute: ${attrName} on <${tagName}>`);
      continue;
    }

    if (HREF_ATTRIBUTES.has(lowerAttrName)) {
      if (EXTERNAL_URL_REGEX.test(attrValue.trim())) {
        errors.push(`Blocked external URL in ${attrName} on <${tagName}>: ${attrValue}`);
        continue;
      }
    }

    if (attrValue) {
      sanitizedTag += ` ${attrName}="${attrValue.replace(/"/g, "&quot;")}"`;
    } else {
      sanitizedTag += ` ${attrName}`;
    }
  }

  if (tag.trim().endsWith("/>")) {
    sanitizedTag += " />";
  } else {
    sanitizedTag += ">";
  }

  return sanitizedTag;
}

export function validateSvg(svg: string): SvgValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!svg || typeof svg !== "string") {
    errors.push("Input must be a non-empty string");
    return { valid: false, sanitizedSvg: "", errors, warnings };
  }

  const trimmed = svg.trim();

  // Check for XML declaration
  let content = trimmed;
  if (content.startsWith("<?xml")) {
    const declEnd = content.indexOf("?>");
    if (declEnd === -1) {
      errors.push("Unterminated XML declaration");
      return { valid: false, sanitizedSvg: "", errors, warnings };
    }
    content = content.slice(declEnd + 2).trim();
  }

  // Check DOCTYPE (block to prevent entity injection)
  if (content.toLowerCase().startsWith("<!doctype")) {
    errors.push("DOCTYPE declarations are not allowed for security");
    return { valid: false, sanitizedSvg: "", errors, warnings };
  }

  // Extract root tag
  const rootTagMatch = content.match(/^<([a-zA-Z][a-zA-Z0-9-]*)/);
  if (!rootTagMatch) {
    errors.push("No root element found");
    return { valid: false, sanitizedSvg: "", errors, warnings };
  }

  const rootTagName = rootTagMatch[1].toLowerCase();
  if (rootTagName !== "svg") {
    errors.push(`Root element must be <svg>, found <${rootTagName}>`);
    return { valid: false, sanitizedSvg: "", errors, warnings };
  }

  // Check viewBox exists on root <svg>
  const svgOpenTagMatch = content.match(/<svg\b[^>]*>/i);
  if (!svgOpenTagMatch) {
    errors.push("Could not parse <svg> opening tag");
    return { valid: false, sanitizedSvg: "", errors, warnings };
  }

  const svgOpenTag = svgOpenTagMatch[0];
  if (!/\bviewBox\s*=/i.test(svgOpenTag)) {
    errors.push("Root <svg> element must have a viewBox attribute");
    return { valid: false, sanitizedSvg: "", errors, warnings };
  }

  // Extract all tags to validate
  const tagRegex = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g;
  const tagStack: string[] = [];
  const sanitizedParts: string[] = [];
  let lastIndex = 0;
  let match;

  while ((match = tagRegex.exec(content)) !== null) {
    const isClosing = match[1] === "/";
    const tagName = match[2].toLowerCase();
    const fullMatch = match[0];
    const matchIndex = match.index;

    // Add text content before this tag
    sanitizedParts.push(content.slice(lastIndex, matchIndex));

    if (BLOCKED_ELEMENTS.has(tagName)) {
      errors.push(`Blocked element found: <${tagName}>`);
      // Skip this element and its content entirely
      if (!isClosing) {
        // Find matching closing tag
        const closeRegex = new RegExp(`<\\/${tagName}\\s*>`, "gi");
        const closeMatch = closeRegex.exec(content);
        if (closeMatch && closeMatch.index > matchIndex) {
          tagRegex.lastIndex = closeMatch.index + closeMatch[0].length;
        } else {
          // Self-contained or unclosed blocked element - just skip the tag
          tagRegex.lastIndex = matchIndex + fullMatch.length;
        }
        lastIndex = tagRegex.lastIndex;
      } else {
        lastIndex = matchIndex + fullMatch.length;
      }
      continue;
    }

    if (!ALLOWED_ELEMENTS.has(tagName)) {
      warnings.push(`Unknown element <${tagName}> will be stripped`);
      if (!isClosing) {
        const closeRegex = new RegExp(`<\\/${tagName}\\s*>`, "gi");
        const closeMatch = closeRegex.exec(content);
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
      const sanitizedTag = sanitizeAttributes(fullMatch, tagName, errors, warnings);
      sanitizedParts.push(sanitizedTag);

      // Check if self-closing
      if (fullMatch.trim().endsWith("/>")) {
        // Self-closing, don't push to stack
      } else {
        tagStack.push(tagName);
      }
    } else {
      // Closing tag - validate stack
      if (tagStack.length > 0 && tagStack[tagStack.length - 1] === tagName) {
        tagStack.pop();
      }
      sanitizedParts.push(`</${tagName}>`);
    }

    lastIndex = matchIndex + fullMatch.length;
  }

  // Add remaining content
  sanitizedParts.push(content.slice(lastIndex));

  if (tagStack.length > 0) {
    warnings.push(`Unclosed tags: ${tagStack.join(", ")}`);
  }

  const sanitizedSvg = sanitizedParts.join("");

  const valid = errors.length === 0;

  return {
    valid,
    sanitizedSvg: valid ? sanitizedSvg : "",
    errors,
    warnings,
  };
}
