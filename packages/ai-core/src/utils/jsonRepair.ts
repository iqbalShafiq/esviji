export function repairJson(jsonString: string): string {
  let repaired = jsonString.trim();

  // Remove markdown code fences
  repaired = repaired.replace(/^```(?:json)?\s*/i, "");
  repaired = repaired.replace(/\s*```\s*$/i, "");

  // Fix trailing commas before } or ]
  repaired = repaired.replace(/,\s*(?=\}|\])/g, "");

  // Fix unquoted keys (simple cases: word characters only)
  repaired = repaired.replace(
    /([{\[,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g,
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
