import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dataGridSource = readFileSync(new URL("../DataGrid.vue", import.meta.url), "utf8");

function functionSource(name: string, nextName: string): string {
  const start = dataGridSource.indexOf(`function ${name}`);
  const relativeEnd = dataGridSource.slice(start).search(new RegExp(`\\n(?:async\\s+)?function\\s+${nextName}\\b`));
  expect(start).toBeGreaterThanOrEqual(0);
  expect(relativeEnd).toBeGreaterThan(0);
  return dataGridSource.slice(start, start + relativeEnd);
}

describe("DataGrid user-facing SQL", () => {
  it("keeps the builder's default ID order when rebuilding the footer SQL", () => {
    const buildSource = functionSource("buildUserFacingSql", "syncUserFacingSql");

    // The rebuild drops the large-value preview projection on purpose, but the
    // builder derives its default `id DESC` order from the known columns. Passing
    // them as order evidence (never as a projection) keeps the copied SQL ordered
    // exactly like the query that actually ran.
    expect(buildSource).toContain("fallbackOrderColumns: props.tableMeta.columns.map((column) => column.name)");
    expect(buildSource).not.toContain("columns: props.tableMeta.columns");
  });
});
