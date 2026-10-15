import { describe, expect, it } from "vitest";
import { buildSpreadsheetGrid, columnClipboardText, columnLetter, defaultCsvSavePath, rangeClipboardText, spreadsheetSourceToRows } from "../spreadsheetGrid";

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

describe("spreadsheetSourceToRows", () => {
  it("reads cells back by position and pads missing ones", () => {
    const { source } = buildSpreadsheetGrid(["a", "b", "c"], [[1, "x", true]]);
    source[0].c1 = "edited";
    delete source[0].c2;

    expect(spreadsheetSourceToRows([...source, { c0: null }], 3)).toEqual([
      [1, "edited", ""],
      ["", "", ""],
    ]);
  });
});

describe("defaultCsvSavePath", () => {
  it("keeps csv paths and swaps other extensions for .csv", () => {
    expect(defaultCsvSavePath("/data/a.CSV")).toBe("/data/a.CSV");
    expect(defaultCsvSavePath("/data/report.v2.xlsx")).toBe("/data/report.v2.csv");
    expect(defaultCsvSavePath("C:\\data\\b.tsv")).toBe("C:\\data\\b.csv");
    expect(defaultCsvSavePath("/data.dir/noext")).toBe("/data.dir/noext.csv");
  });
});

describe("columnClipboardText", () => {
  it("puts one value per line and quotes values containing line breaks, tabs or quotes", () => {
    expect(columnClipboardText([1, "", null, "a\nb", 'say "hi"'], "name")).toBe('name\n1\n\n\n"a\nb"\n"say ""hi"""');
    expect(columnClipboardText(["x"])).toBe("x");
  });
});

describe("rangeClipboardText", () => {
  const { columns, source } = buildSpreadsheetGrid(
    ["id", "name", "note"],
    [
      [1, "a", "x"],
      [2, "b", "tab\there"],
      [3, "c", "z"],
    ],
  );

  it("copies the selected block with its column names as the first row", () => {
    expect(rangeClipboardText(source, columns, { x: 1, y: 1, x1: 2, y1: 2 }, true)).toBe('name\tnote\nb\t"tab\there"\nc\tz');
  });

  it("omits the header row when not requested", () => {
    expect(rangeClipboardText(source, columns, { x: 0, y: 0, x1: 0, y1: 1 }, false)).toBe("1\n2");
  });
});
