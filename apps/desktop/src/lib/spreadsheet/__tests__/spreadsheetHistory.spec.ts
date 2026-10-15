import { describe, expect, it } from "vitest";
import {
  captureSpreadsheetColumns,
  deleteColumnsSplice,
  deleteSpreadsheetRows,
  duplicateColumnsSplice,
  duplicateSpreadsheetRows,
  insertColumnsSplice,
  insertSpreadsheetRows,
  type SpreadsheetColumnSplice,
  spliceSpreadsheetColumnList,
  spliceSpreadsheetColumns,
  type SpreadsheetTable,
} from "../spreadsheetGrid";
import { applySpreadsheetCellChanges, applySpreadsheetRowPatch, diffSpreadsheetRows, invertColumnSplice, SpreadsheetHistory } from "../spreadsheetHistory";

const rows = (...values: string[]) => values.map((value) => ({ c0: value }));
const values = (source: readonly Record<string, unknown>[]) => source.map((record) => record.c0);

describe("SpreadsheetHistory", () => {
  it("undoes and redoes in order and drops the redo branch on a new change", () => {
    const history = new SpreadsheetHistory<string>();
    history.push("a");
    history.push("b");

    expect(history.undo()).toBe("b");
    expect(history.undo()).toBe("a");
    expect(history.undo()).toBeUndefined();
    expect(history.redo()).toBe("a");

    history.push("c");
    expect(history.canRedo).toBe(false);
    expect(history.undo()).toBe("c");
    expect(history.undo()).toBe("a");
  });

  it("is dirty only away from the saved state", () => {
    const history = new SpreadsheetHistory<string>();
    expect(history.dirty).toBe(false);

    history.push("a");
    expect(history.dirty).toBe(true);
    history.undo();
    expect(history.dirty).toBe(false);

    history.redo();
    history.markSaved();
    history.undo();
    expect(history.dirty).toBe(true);
    history.redo();
    expect(history.dirty).toBe(false);

    // The saved state can no longer be reached once its branch is replaced.
    history.undo();
    history.push("b");
    expect(history.dirty).toBe(true);
    history.undo();
    expect(history.dirty).toBe(true);
  });

  it("marks the state captured before an async save, not the one after it", () => {
    const history = new SpreadsheetHistory<string>();
    history.push("a");
    const saved = history.stateId;
    history.push("b");
    history.markSaved(saved);

    expect(history.dirty).toBe(true);
    history.undo();
    expect(history.dirty).toBe(false);
  });

  it("trims the oldest entries and keeps the saved marker on the trimmed base", () => {
    const history = new SpreadsheetHistory<string>(2);
    history.push("a");
    history.markSaved();
    history.push("b");
    history.push("c");

    expect(history.undo()).toBe("c");
    expect(history.undo()).toBe("b");
    expect(history.canUndo).toBe(false);
    expect(history.dirty).toBe(false);
  });

  it("starts clean after a reset", () => {
    const history = new SpreadsheetHistory<string>();
    history.push("a");
    history.reset();

    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(history.dirty).toBe(false);
  });
});

describe("applySpreadsheetCellChanges", () => {
  it("writes the old values on undo and the new ones on redo", () => {
    const source = [{ c0: "x", c1: 1 }, { c0: "y" }];
    const cells = [
      { row: 0, prop: "c1", before: 1, after: 2 },
      { row: 1, prop: "c0", before: "y", after: "" },
    ];

    applySpreadsheetCellChanges(source, cells, "redo");
    expect(source).toEqual([{ c0: "x", c1: 2 }, { c0: "" }]);
    applySpreadsheetCellChanges(source, cells, "undo");
    expect(source).toEqual([{ c0: "x", c1: 1 }, { c0: "y" }]);
  });
});

describe("spreadsheet row patches", () => {
  it.each([
    ["insert", (source: Record<string, unknown>[]) => insertSpreadsheetRows(source, 1, 2, 1)],
    ["duplicate", (source: Record<string, unknown>[]) => duplicateSpreadsheetRows(source, [0, 2]).source],
    ["delete", (source: Record<string, unknown>[]) => deleteSpreadsheetRows(source, [0, 2, 3])],
  ])("round-trips %s through undo and redo", (_, change) => {
    const before = rows("a", "b", "c", "d");
    const after = change(before);
    const patch = diffSpreadsheetRows(before, after);

    const undone = applySpreadsheetRowPatch(after, patch, "undo");
    expect(undone.source).toEqual(before);
    const redone = applySpreadsheetRowPatch(undone.source, patch, "redo");
    expect(redone.source).toEqual(after);
  });

  it("returns the records it puts back so they can be selected", () => {
    const before = rows("a", "b", "c");
    const patch = diffSpreadsheetRows(before, deleteSpreadsheetRows(before, [1]));
    const undone = applySpreadsheetRowPatch(rows("a", "c"), patch, "undo");

    expect(values(undone.restored)).toEqual(["b"]);
    expect(undone.source[1]).toBe(undone.restored[0]);
  });

  it("stores row contents, so later in-place edits of a live record do not leak into redo", () => {
    const before = rows("a");
    const after = insertSpreadsheetRows(before, 1, 1, 1);
    const patch = diffSpreadsheetRows(before, after);
    after[1].c0 = "edited";

    const undone = applySpreadsheetRowPatch(after, patch, "undo");
    expect(values(applySpreadsheetRowPatch(undone.source, patch, "redo").source)).toEqual(["a", ""]);
  });

  it("keeps untouched records by identity", () => {
    const before = rows("a", "b");
    const patch = diffSpreadsheetRows(before, deleteSpreadsheetRows(before, [0]));
    const undone = applySpreadsheetRowPatch([before[1]], patch, "undo");

    expect(undone.source[1]).toBe(before[1]);
  });
});

describe("spreadsheet column history", () => {
  const table = (): SpreadsheetTable => ({
    headers: ["id", "name", "note"],
    source: [
      { c0: 1, c1: "a", c2: "x" },
      { c0: 2, c1: "b", c2: "y" },
    ],
    width: 3,
  });
  const sizes = [80, 120, undefined];

  it.each<[string, SpreadsheetColumnSplice]>([
    ["insert", insertColumnsSplice(1, 2)],
    ["duplicate", duplicateColumnsSplice(0, 1)],
    ["delete", deleteColumnsSplice(1, 2)],
  ])("restores headers, cells and sizes after undoing %s", (_, splice) => {
    const original = table();
    const removed = captureSpreadsheetColumns(original, sizes, splice.at, splice.remove);
    const next = spliceSpreadsheetColumns(original, splice);
    const nextSizes = spliceSpreadsheetColumnList(sizes, splice, undefined);
    const inverse = invertColumnSplice(splice, removed);

    expect(spliceSpreadsheetColumns(next, inverse)).toEqual(original);
    expect(spliceSpreadsheetColumnList(nextSizes, inverse, undefined, (column) => column.size)).toEqual(sizes);
  });

  it("captures only columns that exist", () => {
    expect(captureSpreadsheetColumns(table(), sizes, 2, 5)).toEqual([{ header: "note", size: undefined, values: ["x", "y"] }]);
  });
});
