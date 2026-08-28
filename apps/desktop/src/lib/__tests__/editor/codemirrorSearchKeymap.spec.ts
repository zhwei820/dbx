// @vitest-environment happy-dom

import { EditorState } from "@codemirror/state";
import { searchKeymap } from "@codemirror/search";
import { EditorView, keymap, runScopeHandlers } from "@codemirror/view";
import { describe, expect, it } from "vitest";

describe("CodeMirror occurrence selection shortcut", () => {
  it("keeps the stock Mod-d binding enabled", () => {
    expect(searchKeymap.find((binding) => binding.key === "Mod-d")).toBeDefined();
  });

  it("handles Ctrl+D through the stock search keymap", () => {
    const view = new EditorView({
      parent: document.createElement("div"),
      state: EditorState.create({
        doc: "customer_id = customer_id",
        extensions: [keymap.of([...searchKeymap])],
      }),
    });

    expect(runScopeHandlers(view, new KeyboardEvent("keydown", { key: "d", ctrlKey: true }), "editor")).toBe(true);
    expect(view.state.selection.main.empty).toBe(false);
    view.destroy();
  });
});
