import { describe, expect, it, vi } from "vitest";
import { normalizeDictionaryDefinition, dictionaryAvailable, dictionaryRpc } from "./dictionary";
import { roomPath } from "./impostor-rooms";
describe("Diccionario client boundaries", () => {
    it("normalizes preview without interpreting meaning", () => {
        expect(normalizeDictionaryDefinition("  accio\u0301n\n y  efecto de inventar ")).toBe("Acción y efecto de inventar.");
        expect(normalizeDictionaryDefinition("¿objeto? ")).toBe("¿Objeto?");
        expect(normalizeDictionaryDefinition(" \n ")).toBe("");
        expect(normalizeDictionaryDefinition("😀 sirve para jugar!")).toBe("😀 Sirve para jugar!");
    });
    it("recovers the Dictionary route without changing existing routes", () => {
        expect(roomPath("dictionary", "ABCD")).toBe("/diccionario/sala/ABCD");
        expect(roomPath("impostor", "ABCD")).toBe("/impostor/sala/ABCD");
        expect(roomPath("tutti_frutti", "ABCD")).toBe("/tutti-frutti/sala/ABCD");
    });
    it("does not interpret malformed availability as enabled", async () => {
        expect(await dictionaryAvailable({ rpc: async () => ({ data: "true", error: null }) })).toBe(false);
    });
    it("rejects malformed authorized state instead of rendering it", async () => {
        await expect(dictionaryRpc({ rpc: async () => ({ data: { roomId: "x" }, error: null }) }, "get_dictionary_state", { room_code: "ABCD" })).rejects.toThrow("reconstruir");
    });
    it("shows a useful catalogue exhaustion message without exposing SQL errors", async () => {
        await expect(dictionaryRpc({ rpc: async () => ({ data: null, error: { code: "D0006", message: "private query" } }) }, "start_dictionary_session", {})).rejects.toThrow("palabras nuevas");
    });
});

it("bounds a stalled request and allows a safe retry", async () => {
    vi.useFakeTimers();
    try {
        const client = { rpc: () => Object.assign(Promise.resolve({data:null,error:null}), {
            abortSignal: (signal: AbortSignal) => new Promise<{data:null;error:unknown}>(resolve => {
                signal.addEventListener("abort", () => resolve({data:null,error:{code:"ABORT"}}), {once:true});
            })
        }) };
        const assertion = expect(dictionaryRpc(client,"get_dictionary_state",{})).rejects.toThrow("Reintentá");
        await vi.advanceTimersByTimeAsync(10_000);
        await assertion;
        expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
});
