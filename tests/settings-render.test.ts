import { test } from "node:test";
import assert from "node:assert/strict";
import type { Setting, SettingDefinitionRender, SettingGroup } from "obsidian";
import { freshSettings } from "../src/settings-render";

function fixture() {
  const controls: string[] = [];
  const unmanaged: string[] = ["legacy-advanced", "legacy-advanced"];
  const row = {
    clear() { controls.length = 0; return this; },
    controlEl: { empty() { controls.length = 0; } },
    settingEl: { querySelectorAll() { return unmanaged.map(name => ({ remove() { const index = unmanaged.indexOf(name); if (index >= 0) unmanaged.splice(index, 1); } })); } },
  } as unknown as Setting;
  return { row, controls, unmanaged };
}
const group = {} as SettingGroup;

test("provider switches replace Advanced instead of accumulating custom controls", () => {
  const { row, controls, unmanaged } = fixture();
  const cleanups: (() => void)[] = [];
  for (const provider of ["bedrock", "openai", "gemini", "profile", "openai", "profile"]) {
    const definitions = freshSettings([{ name: "Model", render: () => {
      controls.push("Advanced");
      if (provider !== "profile") controls.push(`Model ID: ${provider}`);
      if (["bedrock", "profile"].includes(provider)) controls.push("AWS region: us-west-2");
    } }]);
    const cleanup = (definitions[0] as SettingDefinitionRender).render(row, group);
    if (cleanup) cleanups.push(cleanup);
    assert.equal(controls.filter(c => c === "Advanced").length, 1);
    assert.equal(controls.some(c => c.startsWith("Model ID:")), provider !== "profile");
    assert.equal(controls.includes("AWS region: us-west-2"), ["bedrock", "profile"].includes(provider));
    assert.equal(unmanaged.length, 0);
  }
  // Late host cleanup from an older render cannot destroy the current controls.
  cleanups[0]!(); assert.equal(controls.filter(c => c === "Advanced").length, 1);
  cleanups.at(-1)!(); assert.deepEqual(controls, []);
});

test("secret selectors and connection statuses also reset and dispose only once", () => {
  const { row, controls, unmanaged } = fixture();
  let disposals = 0;
  const definition = freshSettings([{ name: "Test", render: () => {
    controls.push("secret-selector"); unmanaged.push("status"); return () => { disposals++; };
  } }])[0] as SettingDefinitionRender;
  const first = definition.render(row, group);
  const second = definition.render(row, group);
  assert.equal(disposals, 1); assert.equal(controls.length, 1); assert.equal(unmanaged.length, 1);
  if (first) first(); assert.equal(disposals, 1);
  if (second) second(); assert.equal(disposals, 2); assert.equal(unmanaged.length, 0);
});
