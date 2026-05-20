export function applyTransformToLayer(
  svg: string,
  layerId: string,
  transform: string
): string {
  // Find <g id="layerId"> opening tag
  const escapedId = layerId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const layerRegex = new RegExp(`(<g\\b[^>]*\\bid\\s*=\\s*["']${escapedId}["'][^>]*)>`, "i");
  const match = svg.match(layerRegex);

  if (!match) {
    throw new Error(`Layer with id "${layerId}" not found in SVG`);
  }

  const fullOpeningTag = match[0];
  const tagBeforeGreaterThan = match[1];

  // Check if the tag already has a transform attribute
  const transformRegex = /\btransform\s*=\s*["'][^"]*["']/i;
  const hasTransform = transformRegex.test(tagBeforeGreaterThan);

  if (hasTransform) {
    // Wrap child content in a new nested <g> with the new transform
    // Find the matching closing tag for this <g>
    const tagStartIndex = match.index!;
    const afterOpeningTag = tagStartIndex + fullOpeningTag.length;

    // Find matching closing </g> by tracking depth
    let depth = 1;
    let pos = afterOpeningTag;

    while (depth > 0 && pos < svg.length) {
      const nextOpenIdx = svg.indexOf("<g", pos);
      const nextCloseIdx = svg.indexOf("</g", pos);

      if (nextCloseIdx === -1) {
        throw new Error(`Unclosed <g id="${layerId}"> element`);
      }

      if (nextOpenIdx !== -1 && nextOpenIdx < nextCloseIdx) {
        depth++;
        pos = nextOpenIdx + 2;
      } else {
        depth--;
        if (depth === 0) {
          const children = svg.slice(afterOpeningTag, nextCloseIdx);
          const wrappedChildren = `<g transform="${transform.replace(/"/g, "&quot;")}">${children}</g>`;

          return (
            svg.slice(0, afterOpeningTag) + wrappedChildren + svg.slice(nextCloseIdx)
          );
        }
        pos = nextCloseIdx + 4;
      }
    }

    throw new Error(`Unclosed <g id="${layerId}"> element`);
  } else {
    // No existing transform - just add the attribute
    const newTag = `${tagBeforeGreaterThan} transform="${transform.replace(/"/g, "&quot;")}">`;
    return svg.replace(fullOpeningTag, newTag);
  }
}
