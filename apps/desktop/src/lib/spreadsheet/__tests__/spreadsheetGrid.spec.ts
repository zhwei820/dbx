import { describe, expect, it } from "vitest";
import { buildSpreadsheetGrid, columnLetter } from "../spreadsheetGrid";

describe("buildSpreadsheetGrid", () => {
  it("keys cells by position so duplicate or blank headers stay distinct", () => {
    const { columns, source } = buildSpreadsheetGrid(["id", "id", ""], [[1, "a", true]]);

    expect(columns.map((column) => [column.prop, column.name])).toEqual([
      ["c0", "id"],
      ["c1", "id"],
      ["c2", "C"],
    ]);
    expect(source).toEqual([{ c0: 1, c1: "a", c2: true }]);
  });

  it("widens to the longest row and renders missing or null cells as empty", () => {
    const { columns, source } = buildSpreadsheetGrid(["a"], [[null], ["x", "y"]]);

    expect(columns).toHaveLength(2);
    expect(source).toEqual([
      { c0: "", c1: "" },
      { c0: "x", c1: "y" },
    ]);
  });
});

describe("columnLetter", () => {
  it("follows spreadsheet column naming", () => {
    expect([0, 25, 26, 701, 702].map(columnLetter)).toEqual(["A", "Z", "AA", "ZZ", "AAA"]);
  });
});
