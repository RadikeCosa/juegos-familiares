"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import {
  configurationLabel,
  TUTTI_FRUTTI_PRESET_CATEGORIES,
  type TuttiFruttiRoomConfiguration,
  type TuttiFruttiPresetKey,
  type TuttiFruttiSetupCategory,
  validateTuttiFruttiRoomConfiguration
} from "../../../../lib/supabase/tutti-frutti-room-setup";

export function TuttiFruttiRoomSetup(options: {
  configuration: TuttiFruttiRoomConfiguration;
  isHost: boolean;
  roomStatus: string;
  connection: "online" | "offline" | "reconnecting";
  dirty: boolean;
  stale: boolean;
  saving: boolean;
  error: string | null;
  notice: string | null;
  onChange: (configuration: TuttiFruttiRoomConfiguration) => void;
  onSave: () => void;
  onReload: () => void;
}) {
  const {
    configuration, isHost, roomStatus, connection, dirty, stale, saving,
    error, notice, onChange, onSave, onReload
  } = options;
  const [customLabel, setCustomLabel] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const canEdit = isHost && roomStatus === "lobby" && connection === "online";
  const validationError = validateTuttiFruttiRoomConfiguration(configuration);
  const selectedPresetKeys = new Set(
    configuration.categories.flatMap((category) => category.kind === "preset" ? [category.key] : [])
  );

  function updateCategories(categories: TuttiFruttiSetupCategory[]) {
    onChange({ ...configuration, categories });
  }

  function togglePreset(key: TuttiFruttiPresetKey, checked: boolean) {
    if (checked) {
      if (configuration.categories.length >= 6) return;
      updateCategories([...configuration.categories, { kind: "preset", key }]);
    } else {
      updateCategories(configuration.categories.filter((category) => !(category.kind === "preset" && category.key === key)));
    }
  }

  function reorderCategory(index: number, movement: -1 | 1) {
    const nextIndex = index + movement;
    if (nextIndex < 0 || nextIndex >= configuration.categories.length) return;
    const categories = [...configuration.categories];
    [categories[index], categories[nextIndex]] = [categories[nextIndex], categories[index]];
    updateCategories(categories);
  }

  function addCustomCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = customLabel.trim().normalize("NFC");
    if (!label || [...label].length > 40 || /[\p{Cc}\p{Cs}]/u.test(label)) {
      setCustomError("Usá entre 1 y 40 caracteres imprimibles.");
      return;
    }
    if (configuration.categories.length >= 6) {
      setCustomError("La partida puede tener hasta 6 categorías.");
      return;
    }
    const candidate = [...configuration.categories, { kind: "custom" as const, label }];
    const message = validateTuttiFruttiRoomConfiguration({ ...configuration, categories: candidate });
    if (message) {
      setCustomError(message);
      return;
    }
    updateCategories(candidate);
    setCustomLabel("");
    setCustomError(null);
  }

  return (
    <section className="tutti-setup" aria-labelledby="tutti-setup-title">
      <div className="tutti-setup__heading">
        <div>
          <p className="impostor-kicker">Preparación de la partida</p>
          <h2 id="tutti-setup-title">Configuración</h2>
        </div>
        <span className="tutti-setup__count">{configuration.categories.length}/6 categorías</span>
      </div>

      {roomStatus !== "lobby" ? (
        <p className="tutti-setup__notice">La configuración quedó fijada al comenzar.</p>
      ) : null}
      {!isHost && roomStatus === "lobby" ? (
        <p className="tutti-setup__notice">El anfitrión puede editar y guardar la configuración.</p>
      ) : null}

      <fieldset className="tutti-setup__rounds" disabled={!canEdit || saving}>
        <legend>¿Cuántas rondas quieren jugar?</legend>
        <div className="tutti-setup__round-options">
          {[3, 5, 10].map((roundCount) => (
            <label className="tutti-setup__round-option" key={roundCount}>
              <input
                type="radio"
                name="tutti-round-count"
                value={roundCount}
                checked={configuration.roundCount === roundCount}
                onChange={() => onChange({ ...configuration, roundCount: roundCount as 3 | 5 | 10 })}
              />
              <span>{roundCount} rondas</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="tutti-setup__presets" disabled={!canEdit || saving}>
        <legend>Categorías disponibles</legend>
        <p>Elegí entre 3 y 6. Las personalizadas también cuentan para el máximo.</p>
        <div className="tutti-setup__preset-grid">
          {TUTTI_FRUTTI_PRESET_CATEGORIES.map((preset) => (
            <label className="tutti-setup__choice" key={preset.key}>
              <input
                type="checkbox"
                checked={selectedPresetKeys.has(preset.key)}
                onChange={(event) => togglePreset(preset.key, event.currentTarget.checked)}
              />
              <span>{preset.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <ol className="tutti-setup__selected" aria-label="Orden de las categorías de la partida">
        {configuration.categories.map((category, index) => (
          <li key={category.kind === "preset" ? `preset-${category.key}` : `custom-${category.label}`}>
            <span className="tutti-setup__position">{index + 1}</span>
            <span className="tutti-setup__category-name">{configurationLabel(category)}</span>
            {canEdit ? (
              <div className="tutti-setup__category-actions">
                <button
                  aria-label={`Mover ${configurationLabel(category)} hacia arriba`}
                  className="tutti-setup__small-action"
                  disabled={saving || index === 0}
                  onClick={() => reorderCategory(index, -1)}
                  type="button"
                >↑</button>
                <button
                  aria-label={`Mover ${configurationLabel(category)} hacia abajo`}
                  className="tutti-setup__small-action"
                  disabled={saving || index === configuration.categories.length - 1}
                  onClick={() => reorderCategory(index, 1)}
                  type="button"
                >↓</button>
                <button
                  aria-label={`Quitar ${configurationLabel(category)}`}
                  className="tutti-setup__remove"
                  disabled={saving}
                  onClick={() => updateCategories(configuration.categories.filter((_, itemIndex) => itemIndex !== index))}
                  type="button"
                >Quitar</button>
              </div>
            ) : null}
          </li>
        ))}
      </ol>

      {canEdit ? (
        <form className="tutti-setup__custom-form" onSubmit={addCustomCategory}>
          <label htmlFor="tutti-custom-category">Agregar categoría personalizada</label>
          <p id="tutti-custom-category-hint">Un nombre breve de hasta 40 caracteres.</p>
          <div className="tutti-setup__custom-row">
            <input
              autoComplete="off"
              id="tutti-custom-category"
              maxLength={80}
              aria-describedby={customError ? "tutti-custom-category-hint tutti-custom-category-error" : "tutti-custom-category-hint"}
              value={customLabel}
              onChange={(event) => { setCustomLabel(event.currentTarget.value); setCustomError(null); }}
            />
            <button className="impostor-action" disabled={saving || configuration.categories.length >= 6 || !customLabel.trim()} type="submit">
              Agregar
            </button>
          </div>
          {customError ? <p className="tutti-setup__error" id="tutti-custom-category-error" role="alert">{customError}</p> : null}
        </form>
      ) : null}

      {validationError && canEdit ? <p className="tutti-setup__error" role="status">{validationError}</p> : null}
      {stale ? (
        <div className="tutti-setup__stale" role="status">
          <p>Otra pestaña guardó una configuración más reciente. Recargala para seguir editando.</p>
          <button className="impostor-action" disabled={saving || connection !== "online"} onClick={onReload} type="button">
            Recargar configuración
          </button>
        </div>
      ) : null}
      {error ? <p className="tutti-setup__error" role="alert">{error}</p> : null}
      {notice ? <p className="tutti-setup__saved" aria-live="polite">{notice}</p> : null}

      {canEdit ? (
        <button
          className="impostor-action impostor-action--primary tutti-setup__save"
          disabled={saving || !dirty || Boolean(validationError) || stale}
          onClick={onSave}
          type="button"
        >
          {saving ? "Guardando…" : dirty ? "Guardar configuración" : "Configuración guardada"}
        </button>
      ) : null}
    </section>
  );
}
