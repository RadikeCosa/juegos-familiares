import { describe, expect, it, vi } from "vitest";
import PlatformGroupPage from "./page";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

describe("/grupo compatibility route", () => {
  it("redirects group management to the home screen", () => {
    PlatformGroupPage();
    expect(redirect).toHaveBeenCalledWith("/");
  });
});
