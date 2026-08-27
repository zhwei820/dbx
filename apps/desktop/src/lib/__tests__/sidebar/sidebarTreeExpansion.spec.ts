import { describe, expect, it } from "vitest";
import type { TreeNode } from "@/types/database";
import { collapseOtherExpandedDatabases, syncSidebarTreeNodeExpansion } from "@/lib/sidebar/sidebarTreeExpansion";

function database(id: string, connectionId: string, isExpanded: boolean): TreeNode {
  return {
    id,
    label: id,
    type: "database",
    connectionId,
    database: id,
    isExpanded,
    children: [],
  };
}

describe("sidebar tree expansion", () => {
  it("collapses other expanded databases in the same connection", () => {
    const first = database("first", "connection-1", true);
    const second = database("second", "connection-1", false);
    const otherConnection = database("other", "connection-2", true);
    const nodes: TreeNode[] = [
      {
        id: "connection-1",
        label: "connection-1",
        type: "connection",
        connectionId: "connection-1",
        children: [first, second],
      },
      {
        id: "connection-2",
        label: "connection-2",
        type: "connection",
        connectionId: "connection-2",
        children: [otherConnection],
      },
    ];

    const renderedSecond = { ...second, isExpanded: true };
    expect(syncSidebarTreeNodeExpansion(nodes, renderedSecond, true)).toBe(true);
    expect(collapseOtherExpandedDatabases(nodes, renderedSecond)).toBe(1);

    expect(first.isExpanded).toBe(false);
    expect(second.isExpanded).toBe(true);
    expect(otherConnection.isExpanded).toBe(true);
  });

  it("does nothing when a non-database node expands", () => {
    const expandedDatabase = database("first", "connection-1", true);
    const schema: TreeNode = {
      id: "schema",
      label: "schema",
      type: "schema",
      connectionId: "connection-1",
      database: "first",
      isExpanded: true,
      children: [],
    };

    expect(collapseOtherExpandedDatabases([expandedDatabase, schema], schema)).toBe(0);
    expect(expandedDatabase.isExpanded).toBe(true);
  });

  it("applies the same behavior to document and vector databases", () => {
    const first = { ...database("first", "mongo", true), type: "mongo-db" as const };
    const second = { ...database("second", "mongo", true), type: "mongo-db" as const };
    const vector = { ...database("vector", "milvus", true), type: "vector-database" as const };

    expect(collapseOtherExpandedDatabases([first, second, vector], second)).toBe(1);
    expect(first.isExpanded).toBe(false);
    expect(second.isExpanded).toBe(true);
    expect(vector.isExpanded).toBe(true);
  });
});
