export function repairJson(jsonString: string): string {
  let repaired = extractJsonObject(jsonString.trim());

  // Remove markdown code fences
  repaired = repaired.replace(/^```(?:json)?\s*/i, "");
  repaired = repaired.replace(/\s*```\s*$/i, "");
  repaired = escapeInvalidStringCharacters(repaired);

  // Fix trailing commas before } or ]
  repaired = repaired.replace(/,\s*(?=\}|\])/g, "");

  // Fix unquoted keys (simple cases: word characters only)
  repaired = repaired.replace(
    /([{[,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g,
    '$1"$2":'
  );

  // Fix single quotes to double quotes (naive but best-effort)
  // This is tricky; we only handle simple cases where single quotes wrap values
  repaired = repaired.replace(
    /: '\s*([^'\n\r]*?)\s*'(?=\s*[},\]])/g,
    ': "$1"'
  );

  // Fix missing quotes around string values that are not numbers, booleans, null, or arrays/objects
  // Match property values that look like bare words
  repaired = repaired.replace(
    /: \s*([a-zA-Z_$][a-zA-Z0-9_$\s]*)\s*(?=[,}\]])/g,
    (match, p1) => {
      const lower = p1.trim().toLowerCase();
      if (
        lower === "true" ||
        lower === "false" ||
        lower === "null" ||
        lower === "undefined"
      ) {
        return match;
      }
      return `: "${p1.trim()}"`;
    }
  );

  return repaired;
}

function extractJsonObject(value: string): string {
  const firstObject = value.indexOf("{");
  const firstArray = value.indexOf("[");
  const starts: number[] = [firstObject, firstArray].filter((index) => index >= 0);
  if (starts.length === 0) {
    return value;
  }

  const start = Math.min(...starts);
  const opening = value[start];
  const closing = opening === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < value.length; index++) {
    const char = value[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === opening) {
      depth += 1;
    } else if (char === closing) {
      depth -= 1;
      if (depth === 0) {
        return value.slice(start, index + 1);
      }
    }
  }

  return value.slice(start);
}

function escapeInvalidStringCharacters(value: string): string {
  let output = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < value.length; index++) {
    const char = value[index];

    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      output += char;
      escaped = true;
      continue;
    }

    if (char === "\"") {
      if (!inString) {
        inString = true;
        output += char;
        continue;
      }

      const next = nextNonWhitespace(value, index + 1);
      if (next === ":" || next === "," || next === "}" || next === "]" || next === undefined) {
        inString = false;
        output += char;
        continue;
      }

      output += "\\\"";
      continue;
    }

    if (inString && char === "\n") {
      output += "\\n";
      continue;
    }

    if (inString && char === "\r") {
      output += "\\r";
      continue;
    }

    output += char;
  }

  return output;
}

function nextNonWhitespace(value: string, start: number): string | undefined {
  for (let index = start; index < value.length; index++) {
    const char = value[index];
    if (!/\s/.test(char)) {
      return char;
    }
  }
  return undefined;
}
