import assert from "node:assert/strict";
import { test } from "vitest";
import { int64TimestampPreview, visibleCellDetailTabs } from "../../apps/desktop/src/lib/dataGrid/cellDetailPresentation.ts";

test("visibleCellDetailTabs exposes hex viewer only for binary details", () => {
  assert.deepEqual(visibleCellDetailTabs({ isEditable: false }), ["details"]);
  assert.deepEqual(visibleCellDetailTabs({ isEditable: false, hasBinaryHexViewer: true }), ["details", "hexViewer"]);
});

test("visibleCellDetailTabs preserves value editor ordering", () => {
  assert.deepEqual(visibleCellDetailTabs({ isEditable: true, hasBinaryHexViewer: true }), ["details", "hexViewer", "valueEditor"]);
});

test("int64TimestampPreview presents second timestamps in UTC+0 and UTC+8", () => {
  assert.deepEqual(int64TimestampPreview("1704067200", "BIGINT"), {
    utc: "2024-01-01 00:00:00.000",
    utc8: "2024-01-01 08:00:00.000",
  });
});

test("int64TimestampPreview presents millisecond timestamps from wrapped int64 types", () => {
  assert.deepEqual(int64TimestampPreview(1_704_067_200_123, "Nullable(Int64)"), {
    utc: "2024-01-01 00:00:00.123",
    utc8: "2024-01-01 08:00:00.123",
  });
  assert.deepEqual(int64TimestampPreview("1704067200123", "bigint(20) unsigned"), {
    utc: "2024-01-01 00:00:00.123",
    utc8: "2024-01-01 08:00:00.123",
  });
});

test("int64TimestampPreview rejects non-int64 types, non-integers, and range boundaries", () => {
  assert.equal(int64TimestampPreview("1704067200", "int32"), null);
  assert.equal(int64TimestampPreview("1704067200.5", "int64"), null);
  assert.equal(int64TimestampPreview("1000000000", "int64"), null);
  assert.equal(int64TimestampPreview("10000000000000", "int64"), null);
  assert.equal(int64TimestampPreview("1704067200", "Array(Int64)"), null);
});
