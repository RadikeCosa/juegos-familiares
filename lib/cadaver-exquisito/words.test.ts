import { describe, expect, it } from "vitest";
import fixtures from "./word-fixtures.json";
import { contributionHint, contributionWords, remainingMilliseconds } from "./words";
describe("Cadáver exquisite words", () => {
  for (const fixture of fixtures) it(JSON.stringify(fixture.text), () => {
    expect(contributionWords(fixture.text)).toEqual(fixture.words);
    expect(contributionHint(fixture.text)).toBe(fixture.hint);
  });
  it("uses server time and elapsed duration even with a device clock offset", () => {
    expect(remainingMilliseconds("2026-11-04T00:00:00Z", "2026-11-03T23:50:00Z", 60_000)).toBe(540_000);
    expect(remainingMilliseconds("2026-11-04T00:00:00Z", "2026-11-03T23:50:00Z", 700_000)).toBe(0);
  });
});
