import { describe, expect, it, vi } from "vitest";
import { cadaverRpc, parseCadaverState, parseCadaverStory, parseCadaverHistory } from "./cadaver-exquisito";
import { roomPath } from "./impostor-rooms";
describe("Cadáver client boundary", () => {
  it("routes the new game without changing existing ones", () => {
    expect(roomPath("cadaver_exquisito", "CASA-LUNA")).toBe("/cadaver-exquisito/sala/CASA-LUNA");
    expect(roomPath("dictionary", "CASA-LUNA")).toBe("/diccionario/sala/CASA-LUNA");
  });
  it("rejects malformed state and result models", () => {
    expect(() => parseCadaverState({ roomId: "x" })).toThrow("reconstruir");
    expect(() => parseCadaverStory({ contributions: [] })).toThrow("recuperar");
    expect(() => parseCadaverHistory([{ finishedAt: "invalid" }])).toThrow("recuperar");
  });
  it("never exposes raw SQL error content", async () => {
    await expect(cadaverRpc({ rpc: async () => ({ data: null, error: { code: "C0008", message: "private SQL" } }) }, "get_cadaver_state")).rejects.toThrow("venció");
  });
  it("passes one immutable operation identity through a retry", async () => {
    const args = { operation_id: "one", contribution_text: "Había una historia" };
    const rpc = vi.fn().mockResolvedValue({ data: { status: "completed" }, error: null });
    await cadaverRpc({ rpc }, "submit_cadaver_contribution", args);
    await cadaverRpc({ rpc }, "submit_cadaver_contribution", args);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  });
  it("bounds a stalled network request", async () => {
    vi.useFakeTimers();
    try {
      const rpc = () => Object.assign(Promise.resolve({ data: null, error: null }), {
        abortSignal: (signal: AbortSignal) => new Promise<{ data: null; error: unknown }>(resolve => signal.addEventListener("abort", () => resolve({ data: null, error: { code: "ABORT" } }), { once: true }))
      });
      const assertion = expect(cadaverRpc({ rpc }, "get_cadaver_state")).rejects.toThrow("reintentar");
      await vi.advanceTimersByTimeAsync(10_000); await assertion;
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});
