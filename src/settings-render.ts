import type { Setting, SettingDefinitionItem, SettingDefinitionRender } from "obsidian";

/** Obsidian may reuse a row when update() rebuilds its definitions. */
const cleanupByRow = new WeakMap<Setting, () => void>();
export function freshSettings(definitions: SettingDefinitionItem[]): SettingDefinitionItem[] {
  return definitions.map(definition => {
    if (!("render" in definition) || typeof definition.render !== "function") return definition;
    const render = definition.render;
    const wrapped: SettingDefinitionRender = { ...definition, render: (row, group) => {
      cleanupByRow.get(row)?.();
      const clear = () => {
        row.clear();
        row.controlEl.empty(); // Includes unmanaged SecretComponent and custom details nodes.
        row.settingEl.querySelectorAll(".s2r-ai-advanced, .s2r-ai-status").forEach(el => el.remove());
      };
      clear();
      const dispose = render(row, group);
      let disposed = false;
      const cleanup = () => {
        if (disposed) return;
        disposed = true;
        if (typeof dispose === "function") dispose();
        clear();
      };
      cleanupByRow.set(row, cleanup);
      return cleanup;
    } };
    return wrapped;
  });
}
