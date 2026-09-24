import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TUTTI_FRUTTI_ROOM_CONFIGURATION,
  getTuttiFruttiRoomConfiguration,
  saveTuttiFruttiRoomConfiguration,
  validateTuttiFruttiRoomConfiguration,
  type TuttiFruttiRoomConfiguration,
  type TuttiFruttiRoomSetupClient
} from "./tutti-frutti-room-setup";

describe("Tutti Frutti room setup client", () => {
  it("uses five suggested presets and five rounds as the initial draft", () => {
    expect(DEFAULT_TUTTI_FRUTTI_ROOM_CONFIGURATION).toEqual({
      version: 1,
      roundCount: 5,
      categories: ["name", "animal", "food", "place", "object"].map((key) => ({ kind: "preset", key }))
    });
  });

  it("rejects a custom name matching any preset, including an inactive preset", () => {
    const configuration: TuttiFruttiRoomConfiguration = {
      version: 1,
      roundCount: 3,
      categories: [
        { kind: "preset", key: "name" },
        { kind: "preset", key: "animal" },
        { kind: "preset", key: "food" },
        { kind: "custom", label: "  CIUDAD " }
      ]
    };
    expect(validateTuttiFruttiRoomConfiguration(configuration)).toContain("predefinida");
  });

  it("trims and normalizes custom names while preserving accents and punctuation", () => {
    const valid: TuttiFruttiRoomConfiguration = {
      version: 1,
      roundCount: 10,
      categories: [
        { kind: "preset", key: "name" },
        { kind: "preset", key: "animal" },
        { kind: "custom", label: "  Café favorito?  " }
      ]
    };
    expect(validateTuttiFruttiRoomConfiguration(valid)).toBeNull();
    expect(validateTuttiFruttiRoomConfiguration({
      ...valid,
      categories: [...valid.categories.slice(0, 2), { kind: "custom", label: "   " }]
    })).toContain("1 y 40");
  });

  it("counts Unicode code points and keeps accents distinct for duplicate checks", () => {
    const withAccents: TuttiFruttiRoomConfiguration = {
      version: 1,
      roundCount: 3,
      categories: [
        { kind: "preset", key: "name" },
        { kind: "custom", label: "Café" },
        { kind: "custom", label: "Cafe" }
      ]
    };
    expect(validateTuttiFruttiRoomConfiguration(withAccents)).toBeNull();
    expect(validateTuttiFruttiRoomConfiguration({
      ...withAccents,
      categories: [
        { kind: "preset", key: "name" },
        { kind: "preset", key: "animal" },
        { kind: "custom", label: "🧀".repeat(41) }
      ]
    })).toContain("1 y 40");
  });

  it("reads defaults and persists only through the whole-config RPC", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: { configuration: DEFAULT_TUTTI_FRUTTI_ROOM_CONFIGURATION, updatedAt: null }, error: null
      })
      .mockResolvedValueOnce({
        data: { configuration: DEFAULT_TUTTI_FRUTTI_ROOM_CONFIGURATION, updatedAt: "2026-09-24T12:00:00Z" }, error: null
      });
    const client = { rpc } as unknown as TuttiFruttiRoomSetupClient;
    const initial = await getTuttiFruttiRoomConfiguration(client, "room-1");
    const saved = await saveTuttiFruttiRoomConfiguration(client, "room-1", DEFAULT_TUTTI_FRUTTI_ROOM_CONFIGURATION);
    expect(initial.updatedAt).toBeNull();
    expect(saved.updatedAt).toBe("2026-09-24T12:00:00Z");
    expect(rpc).toHaveBeenNthCalledWith(1, "get_tutti_frutti_room_setup", { target_room_id: "room-1" });
    expect(rpc).toHaveBeenNthCalledWith(2, "save_tutti_frutti_room_setup", {
      target_room_id: "room-1",
      requested_configuration: DEFAULT_TUTTI_FRUTTI_ROOM_CONFIGURATION
    });
  });

  it("maps stable database error codes and uses a generic fallback for unknown codes", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "P0034" } }) } as unknown as TuttiFruttiRoomSetupClient;
    await expect(getTuttiFruttiRoomConfiguration(client, "room-1")).rejects.toThrow("quedó bloqueada");
    const unknownClient = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "XX000" } }) } as unknown as TuttiFruttiRoomSetupClient;
    await expect(getTuttiFruttiRoomConfiguration(unknownClient, "room-1")).rejects.toThrow("No pudimos completar");
  });
});
