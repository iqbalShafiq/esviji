import { z } from "zod";

export function coercedBoolean() {
  return z.preprocess((val) => {
    if (typeof val === "string") {
      const lower = val.toLowerCase().trim();
      if (lower === "true" || lower === "1" || lower === "yes" || lower === "on")
        return true;
      if (lower === "false" || lower === "0" || lower === "no" || lower === "off")
        return false;
      if (lower === "none" || lower === "null" || lower === "undefined" || lower === "")
        return false;
      return true;
    }
    if (typeof val === "number") {
      return val !== 0;
    }
    if (val === null || val === undefined) {
      return false;
    }
    return val;
  }, z.boolean());
}

export function coercedNumber() {
  return z.preprocess((val) => {
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (trimmed === "") return val;

      const lowered = trimmed.toLowerCase();
      if (lowered === "none" || lowered === "no" || lowered === "off") return 0;
      if (lowered === "low") return 0.25;
      if (lowered === "medium") return 0.5;
      if (lowered === "high") return 0.75;
      if (lowered === "full" || lowered === "max") return 1;

      const direct = Number(trimmed);
      if (!Number.isNaN(direct)) return direct;

      const extracted = trimmed.match(/-?\d+(?:\.\d+)?/);
      if (extracted) {
        const num = Number(extracted[0]);
        if (!Number.isNaN(num)) return num;
      }
    }
    if (typeof val === "boolean") {
      return val ? 1 : 0;
    }
    return val;
  }, z.number());
}

export function coercedInt() {
  return z.preprocess((val) => {
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (trimmed === "") return val;
      const num = Number(trimmed);
      if (!Number.isNaN(num)) return Math.round(num);
    }
    if (typeof val === "boolean") {
      return val ? 1 : 0;
    }
    if (typeof val === "number") {
      return Math.round(val);
    }
    return val;
  }, z.number().int());
}
