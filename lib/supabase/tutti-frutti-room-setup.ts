export const TUTTI_FRUTTI_PRESET_CATEGORIES = [
  { key: "name", label: "Nombre" },
  { key: "animal", label: "Animal" },
  { key: "food", label: "Comida" },
  { key: "place", label: "Lugar" },
  { key: "object", label: "Objeto" },
  { key: "country", label: "País" },
  { key: "city", label: "Ciudad" },
  { key: "profession", label: "Profesión" },
  { key: "famous_person", label: "Persona famosa" },
  { key: "movie_or_series", label: "Película o serie" }
] as const;

export type TuttiFruttiPresetKey = typeof TUTTI_FRUTTI_PRESET_CATEGORIES[number]["key"];
export type TuttiFruttiSetupCategory =
  | { kind: "preset"; key: TuttiFruttiPresetKey }
  | { kind: "custom"; label: string };

export type TuttiFruttiRoomConfiguration = {
  version: 1;
  roundCount: 3 | 5 | 10;
  categories: TuttiFruttiSetupCategory[];
};

export type SavedTuttiFruttiRoomConfiguration = {
  configuration: TuttiFruttiRoomConfiguration;
  updatedAt: string | null;
};

export const DEFAULT_TUTTI_FRUTTI_ROOM_CONFIGURATION: TuttiFruttiRoomConfiguration = {
  version: 1,
  roundCount: 5,
  categories: TUTTI_FRUTTI_PRESET_CATEGORIES.slice(0, 5).map(({ key }) => ({ kind: "preset", key }))
};

export const TUTTI_FRUTTI_SETUP_ERROR_MESSAGES: Record<string, string> = {
  P0031: "No pudimos confirmar tu identidad. Volvé a ingresar a la sala.",
  P0032: "La sala Tutti Frutti no está disponible para tu cuenta.",
  P0033: "Solo el anfitrión puede editar la configuración.",
  P0034: "La partida ya empezó y la configuración quedó bloqueada.",
  P0035: "Revisá las rondas y las categorías seleccionadas.",
  P0036: "Ese nombre de categoría ya está en uso."
};

type SupabaseRpcResult<TData> = { data: TData | null; error: unknown };
export type TuttiFruttiRoomSetupClient = {
  rpc: (
    fn: "get_tutti_frutti_room_setup" | "save_tutti_frutti_room_setup",
    params: { target_room_id: string } | {
      target_room_id: string;
      requested_configuration: TuttiFruttiRoomConfiguration;
    }
  ) => PromiseLike<SupabaseRpcResult<unknown>>;
};

function getErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : undefined;
}

function errorMessage(error: unknown) {
  return TUTTI_FRUTTI_SETUP_ERROR_MESSAGES[getErrorCode(error) ?? ""]
    ?? "No pudimos completar la operación. Intentá de nuevo.";
}

function isPresetKey(value: unknown): value is TuttiFruttiPresetKey {
  return typeof value === "string" && TUTTI_FRUTTI_PRESET_CATEGORIES.some((category) => category.key === value);
}

export function isTuttiFruttiRoomConfiguration(value: unknown): value is TuttiFruttiRoomConfiguration {
  if (typeof value !== "object" || value === null) return false;
  const configuration = value as Partial<TuttiFruttiRoomConfiguration>;
  if (configuration.version !== 1 || ![3, 5, 10].includes(configuration.roundCount ?? 0)) return false;
  if (!Array.isArray(configuration.categories) || configuration.categories.length < 3 || configuration.categories.length > 6) return false;

  return configuration.categories.every((category) => {
    if (typeof category !== "object" || category === null) return false;
    if (category.kind === "preset") return isPresetKey(category.key);
    if (category.kind !== "custom" || typeof category.label !== "string") return false;
    const label = category.label.trim().normalize("NFC");
    const labelLength = [...label].length;
    return labelLength >= 1 && labelLength <= 40 && !/[\p{Cc}\p{Cs}]/u.test(label);
  });
}

export function configurationLabel(category: TuttiFruttiSetupCategory) {
  return category.kind === "custom"
    ? category.label
    : TUTTI_FRUTTI_PRESET_CATEGORIES.find((preset) => preset.key === category.key)?.label ?? "Categoría";
}

export function validateTuttiFruttiRoomConfiguration(configuration: TuttiFruttiRoomConfiguration): string | null {
  if (![3, 5, 10].includes(configuration.roundCount)) return "Elegí 3, 5 o 10 rondas.";
  if (configuration.categories.length < 3 || configuration.categories.length > 6) {
    return "Elegí entre 3 y 6 categorías.";
  }

  const seen = new Set<string>();
  for (const category of configuration.categories) {
    const label = configurationLabel(category).trim().normalize("NFC");
    if (category.kind === "custom" && ([...label].length < 1 || [...label].length > 40 || /[\p{Cc}\p{Cs}]/u.test(label))) {
      return "Cada categoría personalizada debe tener entre 1 y 40 caracteres imprimibles.";
    }
    const duplicateKey = label.toLowerCase();
    if (seen.has(duplicateKey)) return "No repitas categorías ni uses el nombre de una categoría predefinida.";
    seen.add(duplicateKey);
  }

  for (const category of configuration.categories) {
    if (category.kind !== "custom") continue;
    const customKey = category.label.trim().normalize("NFC").toLowerCase();
    if (TUTTI_FRUTTI_PRESET_CATEGORIES.some((preset) => preset.label.toLowerCase() === customKey)) {
      return "No uses el nombre de una categoría predefinida para una categoría personalizada.";
    }
  }

  return null;
}

function parseSavedConfiguration(value: unknown): SavedTuttiFruttiRoomConfiguration {
  if (typeof value !== "object" || value === null || !("configuration" in value)) {
    throw new Error("No pudimos recuperar la configuración de la sala.");
  }
  const response = value as { configuration?: unknown; updatedAt?: unknown };
  if (!isTuttiFruttiRoomConfiguration(response.configuration)) {
    throw new Error("La configuración guardada no tiene un formato válido.");
  }
  return {
    configuration: response.configuration,
    updatedAt: typeof response.updatedAt === "string" ? response.updatedAt : null
  };
}

export async function getTuttiFruttiRoomConfiguration(
  supabase: TuttiFruttiRoomSetupClient,
  roomId: string
): Promise<SavedTuttiFruttiRoomConfiguration> {
  const result = await supabase.rpc("get_tutti_frutti_room_setup", { target_room_id: roomId });
  if (result.error) throw new Error(errorMessage(result.error));
  return parseSavedConfiguration(result.data);
}

export async function saveTuttiFruttiRoomConfiguration(
  supabase: TuttiFruttiRoomSetupClient,
  roomId: string,
  configuration: TuttiFruttiRoomConfiguration
): Promise<SavedTuttiFruttiRoomConfiguration> {
  const localError = validateTuttiFruttiRoomConfiguration(configuration);
  if (localError) throw new Error(localError);

  const result = await supabase.rpc("save_tutti_frutti_room_setup", {
    target_room_id: roomId,
    requested_configuration: configuration
  });
  if (result.error) throw new Error(errorMessage(result.error));
  return parseSavedConfiguration(result.data);
}
