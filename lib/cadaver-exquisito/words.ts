import ranges from "./word-ranges.json";
const separators = /[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+/gu;
export function normalizeContribution(text: string): string {
  return text.normalize("NFC").replace(separators, " ").replace(/^ +| +$/g, "");
}
function hasWordCharacter(token: string): boolean {
  return Array.from(token).some(character => {
    const n = character.codePointAt(0)!;
    let lo = 0, hi = ranges.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1, [start, end] = ranges[mid];
      if (n < start) hi = mid - 1;
      else if (n > end) lo = mid + 1;
      else return true;
    }
    return false;
  });
}
export function contributionWords(text: string): string[] {
  return normalizeContribution(text).split(" ").filter(hasWordCharacter);
}
export function contributionHint(text: string): string {
  return contributionWords(text).slice(-3).join(" ");
}
/** Use elapsed monotonic time since the server response, never the device wall clock. */
export function remainingMilliseconds(expiresAt: string, serverNow: string, elapsed: number): number {
  return Math.max(0, Date.parse(expiresAt) - Date.parse(serverNow) - elapsed);
}
