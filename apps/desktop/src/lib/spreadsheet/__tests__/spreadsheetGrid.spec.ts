import { describe, expect, it } from "vitest";
import {
  buildSpreadsheetGrid,
  columnClipboardText,
  columnLetter,
  defaultCsvSavePath,
  deleteColumnsSplice,
  deleteSpreadsheetRows,
  duplicateColumnsSplice,
  duplicateSpreadsheetRows,
  findSpreadsheetMatches,
  insertColumnsSplice,
  insertSpreadsheetRows,
  parseSpreadsheetClipboard,
  rangeClipboardText,
  renameSpreadsheetHeader,
  spliceSpreadsheetColumnList,
  spliceSpreadsheetColumns,
  spreadsheetColumnName,
  spreadsheetColumns,
  spreadsheetMatchFrom,
  spreadsheetPasteCells,
  spreadsheetSourceToRows,
} from "../spreadsheetGrid";

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

describe("spreadsheet column names", () => {
  it("shows the column letter for a blank header", () => {
    expect(spreadsheetColumnName(["id", ""], 0)).toBe("id");
    expect(spreadsheetColumnName(["id", ""], 1)).toBe("B");
    expect(spreadsheetColumnName(["id"], 2)).toBe("C");
  });

  it("renames one header and pads headers out to the grid width", () => {
    const headers = ["id", "name"];

    expect(renameSpreadsheetHeader(headers, 2, 1, "姓名")).toEqual(["id", "姓名"]);
    expect(renameSpreadsheetHeader(headers, 4, 3, "extra")).toEqual(["id", "name", "", "extra"]);
    expect(renameSpreadsheetHeader(headers, 2, 0, "")).toEqual(["", "name"]);
    expect(renameSpreadsheetHeader(headers, 2, 5, "out")).toEqual(["id", "name"]);
    expect(headers).toEqual(["id", "name"]);
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

describe("spreadsheet row editing", () => {
  const source = () => [{ c0: "a" }, { c0: "b" }, { c0: "c" }];

  it("inserts empty rows at a physical index without copying the other records", () => {
    const original = source();
    const next = insertSpreadsheetRows(original, 1, 2, 2);

    expect(next).toEqual([{ c0: "a" }, { c0: "", c1: "" }, { c0: "", c1: "" }, { c0: "b" }, { c0: "c" }]);
    expect(next[0]).toBe(original[0]);
    expect(next[1]).not.toBe(next[2]);
  });

  it("clamps the insert position to the source bounds", () => {
    expect(insertSpreadsheetRows(source(), 99, 1, 1).at(-1)).toEqual({ c0: "" });
    expect(insertSpreadsheetRows([], 0, 1, 1)).toEqual([{ c0: "" }]);
  });

  it("duplicates rows as one block after the last selected row", () => {
    const original = source();
    const result = duplicateSpreadsheetRows(original, [2, 0]);

    expect(result.source.map((row) => row.c0)).toEqual(["a", "b", "c", "a", "c"]);
    expect(result).toMatchObject({ at: 3, count: 2 });
    expect(result.source[3]).not.toBe(original[0]);
  });

  it("deletes rows by physical index", () => {
    expect(deleteSpreadsheetRows(source(), [0, 2])).toEqual([{ c0: "b" }]);
  });
});

describe("spreadsheet column editing", () => {
  const table = () => ({
    headers: ["id", "name"],
    source: [
      { c0: 1, c1: "x" },
      { c0: 2, c1: "y" },
    ],
    width: 3,
  });

  it("re-keys cells after inserting empty columns", () => {
    const next = spliceSpreadsheetColumns(table(), insertColumnsSplice(1, 2));

    expect(next.width).toBe(5);
    expect(next.headers).toEqual(["id", "", "", "name", ""]);
    expect(next.source[0]).toEqual({ c0: 1, c1: "", c2: "", c3: "x", c4: "" });
  });

  it("duplicates a column range to its right with the same headers and values", () => {
    const next = spliceSpreadsheetColumns(table(), duplicateColumnsSplice(0, 1));

    expect(next.headers).toEqual(["id", "name", "id", "name", ""]);
    expect(next.source[1]).toEqual({ c0: 2, c1: "y", c2: 2, c3: "y", c4: "" });
  });

  it("deletes a column range", () => {
    const next = spliceSpreadsheetColumns(table(), deleteColumnsSplice(0, 0));

    expect(next.headers).toEqual(["name", ""]);
    expect(next.source[0]).toEqual({ c0: "x", c1: "" });
  });

  it("applies the same splice to per-column metadata such as widths", () => {
    expect(spliceSpreadsheetColumnList([80, 120], duplicateColumnsSplice(1, 1), undefined)).toEqual([80, 120, 120]);
    expect(spliceSpreadsheetColumnList<number | undefined>([80, 120], insertColumnsSplice(0, 1), undefined)).toEqual([undefined, 80, 120]);
  });

  it("names columns from headers with letter fallbacks and keeps known widths", () => {
    expect(spreadsheetColumns(["id", ""], 3, [90]).map((column) => [column.prop, column.name, column.size])).toEqual([
      ["c0", "id", 90],
      ["c1", "B", 140],
      ["c2", "C", 140],
    ]);
  });
});

describe("spreadsheet search", () => {
  const rows = [
    { c0: "Alpha", c1: 10 },
    { c0: "beta", c1: "ALPHABET" },
    { c0: "", c1: null },
    { c0: "gamma", c1: "alp" },
  ];

  it("finds case-insensitive matches row by row", () => {
    expect(findSpreadsheetMatches(rows, ["c0", "c1"], "ALP")).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 3 },
    ]);
    expect(findSpreadsheetMatches(rows, ["c0", "c1"], "10")).toEqual([{ x: 1, y: 0 }]);
    expect(findSpreadsheetMatches(rows, ["c0", "c1"], "")).toEqual([]);
  });

  it("stops at the match limit", () => {
    expect(findSpreadsheetMatches(rows, ["c0", "c1"], "a", 2)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 1 },
    ]);
  });

  it("steps from the cursor and wraps around", () => {
    const matches = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 3 },
    ];
    expect(spreadsheetMatchFrom(matches, undefined, 1)).toBe(0);
    expect(spreadsheetMatchFrom(matches, undefined, -1)).toBe(2);
    expect(spreadsheetMatchFrom(matches, { x: 1, y: 1 }, 1)).toBe(2);
    expect(spreadsheetMatchFrom(matches, { x: 1, y: 1 }, 1, true)).toBe(1);
    expect(spreadsheetMatchFrom(matches, { x: 0, y: 2 }, 1)).toBe(2);
    expect(spreadsheetMatchFrom(matches, { x: 1, y: 3 }, 1)).toBe(0);
    expect(spreadsheetMatchFrom(matches, { x: 1, y: 1 }, -1)).toBe(0);
    expect(spreadsheetMatchFrom(matches, { x: 0, y: 0 }, -1)).toBe(2);
    expect(spreadsheetMatchFrom([], { x: 0, y: 0 }, 1)).toBe(-1);
  });
});

describe("spreadsheet paste", () => {
  it("parses tab-separated text with quoted fields", () => {
    expect(parseSpreadsheetClipboard("word")).toEqual([["word"]]);
    expect(parseSpreadsheetClipboard("a\tb\r\nc\td\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(parseSpreadsheetClipboard('"x\ty"\t"say ""hi"""\n"line\nbreak"')).toEqual([["x\ty", 'say "hi"'], ["line\nbreak"]]);
    expect(parseSpreadsheetClipboard("")).toEqual([]);
  });

  it("fills every selected cell with a single copied value", () => {
    const cells = spreadsheetPasteCells([["word"]], { x: 1, y: 0, x1: 1, y1: 3 }, 10, 3);
    expect(cells).toEqual([0, 1, 2, 3].map((y) => ({ x: 1, y, value: "word" })));
  });

  it("repeats a block that tiles the selection and pastes it once otherwise", () => {
    expect(spreadsheetPasteCells([["a"], ["b"]], { x: 0, y: 0, x1: 0, y1: 3 }, 10, 3).map((cell) => cell.value)).toEqual(["a", "b", "a", "b"]);
    expect(spreadsheetPasteCells([["a"], ["b"]], { x: 0, y: 0, x1: 0, y1: 2 }, 10, 3).map((cell) => cell.value)).toEqual(["a", "b"]);
  });

  it("drops cells past the sheet edge", () => {
    expect(spreadsheetPasteCells([["a", "b"]], { x: 2, y: 4, x1: 2, y1: 4 }, 5, 3)).toEqual([{ x: 2, y: 4, value: "a" }]);
  });
});
