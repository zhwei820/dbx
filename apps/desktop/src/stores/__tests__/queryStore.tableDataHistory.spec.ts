import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  analyzeEditableQueryEditability: vi.fn(),
  buildTableSelectSql: vi.fn(),
  closeClientConnectionSession: vi.fn(),
  closeQuerySession: vi.fn(),
  executeMulti: vi.fn(),
  getConnectionConfig: vi.fn(),
  saveOpenTabsState: vi.fn(),
  loadTableMetadata: vi.fn(),
  prepareQueryPaginationExecutionPlan: vi.fn(),
  historyAdd: vi.fn(),
  metadataGeneration: 0,
}));

vi.mock("@/lib/backend/api", () => ({
  analyzeEditableQueryEditability: mocks.analyzeEditableQueryEditability,
  buildTableSelectSql: mocks.buildTableSelectSql,
  closeClientConnectionSession: mocks.closeClientConnectionSession,
  closeQuerySession: mocks.closeQuerySession,
  executeMulti: mocks.executeMulti,
  prepareQueryPaginationExecutionPlan: mocks.prepareQueryPaginationExecutionPlan,
  saveOpenTabsState: mocks.saveOpenTabsState,
}));

vi.mock("@/stores/connectionStore", () => ({
  useConnectionStore: () => ({
    ensureConnected: vi.fn().mockResolvedValue(undefined),
    getConfig: mocks.getConnectionConfig,
    recordConnectionLostError: vi.fn(),
    metadataGenerationFor: () => mocks.metadataGeneration,
  }),
}));

vi.mock("@/stores/historyStore", () => ({
  useHistoryStore: () => ({ add: mocks.historyAdd }),
}));

vi.mock("@/lib/metadata/tableMetadataCache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/metadata/tableMetadataCache")>();
  return {
    ...actual,
    loadTableMetadata: mocks.loadTableMetadata,
  };
});

vi.mock("@/stores/settingsStore", () => ({
  useSettingsStore: () => ({
    editorSettings: { pageSize: 1000 },
  }),
}));

function installLocalStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => data.set(key, value)),
    removeItem: vi.fn((key: string) => data.delete(key)),
  });
}

const TABLE_SQL = "SELECT id, status FROM public.users LIMIT 100 OFFSET 0";

async function dataTabStore() {
  const { useQueryStore } = await import("@/stores/queryStore");
  const store = useQueryStore();
  const tabId = store.createTab("pg-1", "app", "users", "data", "public");
  store.setTableMeta(tabId, {
    schema: "public",
    tableName: "users",
    tableType: "TABLE",
    columns: [
      { name: "id", data_type: "integer", is_nullable: false, column_default: null, is_primary_key: true, extra: null },
      { name: "status", data_type: "text", is_nullable: true, column_default: null, is_primary_key: false, extra: null },
    ],
    primaryKeys: ["id"],
  });
  return { store, tabId };
}

describe("queryStore table data history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    installLocalStorage();
    setActivePinia(createPinia());
    mocks.metadataGeneration = 0;
    mocks.historyAdd.mockResolvedValue(undefined);
    mocks.getConnectionConfig.mockReturnValue({
      id: "pg-1",
      name: "Postgres",
      db_type: "postgres",
      database: "app",
      query_timeout_secs: 30,
    });
    mocks.buildTableSelectSql.mockResolvedValue(TABLE_SQL);
    // Background editability analysis of a query tab: irrelevant here, but it
    // must resolve or the store logs an unhandled rejection after the test.
    mocks.analyzeEditableQueryEditability.mockResolvedValue({ editable: false, reason: "aggregation" });
    mocks.prepareQueryPaginationExecutionPlan.mockImplementation(async ({ sql }: { sql: string }) => ({ sqlToExecute: sql, useAgentResultSession: false }));
    mocks.executeMulti.mockResolvedValue([
      {
        columns: ["id", "status"],
        rows: [],
        affected_rows: 0,
        execution_time_ms: 1,
      },
    ]);
  });

  it("records the generated SELECT when a table data tab reads rows", async () => {
    const { store, tabId } = await dataTabStore();

    await expect(store.refreshDataTab(tabId)).resolves.toBe(true);

    expect(mocks.historyAdd).toHaveBeenCalledTimes(1);
    expect(mocks.historyAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        connection_id: "pg-1",
        connection_name: "Postgres",
        database: "app",
        sql: TABLE_SQL,
        success: true,
        error: undefined,
        activity_kind: "query",
        operation: "SELECT",
        target: "public.users",
      }),
    );
    expect(mocks.historyAdd.mock.calls[0][0].execution_time_ms).toBeTypeOf("number");
  });

  it("records paging and filtering reads as separate entries", async () => {
    const { store, tabId } = await dataTabStore();
    const tab = store.tabs.find((candidate) => candidate.id === tabId)!;

    await store.refreshDataTab(tabId);
    tab.whereInput = "status = 'ACTIVE'";
    tab.resultPageOffset = 100;
    mocks.buildTableSelectSql.mockResolvedValueOnce("SELECT id, status FROM public.users WHERE status = 'ACTIVE' LIMIT 100 OFFSET 100");
    await store.refreshDataTab(tabId);

    expect(mocks.historyAdd).toHaveBeenCalledTimes(2);
    expect(mocks.historyAdd.mock.calls[1][0].sql).toBe("SELECT id, status FROM public.users WHERE status = 'ACTIVE' LIMIT 100 OFFSET 100");
  });

  it("records a failed table read with its error message", async () => {
    const { store, tabId } = await dataTabStore();
    mocks.executeMulti.mockRejectedValueOnce(new Error('relation "public.users" does not exist'));

    await store.refreshDataTab(tabId);

    expect(mocks.historyAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: TABLE_SQL,
        success: false,
        error: 'relation "public.users" does not exist',
      }),
    );
  });

  it("leaves query tabs to the editor execution path so they are not recorded twice", async () => {
    const { useQueryStore } = await import("@/stores/queryStore");
    const store = useQueryStore();
    const tabId = store.createTab("pg-1", "app", "sql", "query");

    await store.executeTabSql(tabId, "SELECT 1");

    expect(mocks.executeMulti).toHaveBeenCalledTimes(1);
    expect(mocks.historyAdd).not.toHaveBeenCalled();
  });

  it("does not record a table read whose execution was superseded by a newer one", async () => {
    const { store, tabId } = await dataTabStore();
    const tab = store.tabs.find((candidate) => candidate.id === tabId)!;
    let resolveExecute!: (results: unknown[]) => void;
    mocks.executeMulti.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveExecute = resolve as (results: unknown[]) => void;
      }),
    );

    const superseded = store.refreshDataTab(tabId);
    await vi.waitFor(() => expect(mocks.executeMulti).toHaveBeenCalledTimes(1));
    // A newer execution takes ownership of the tab while the first is in flight.
    tab.executionId = "newer-execution";
    resolveExecute([{ columns: ["id"], rows: [], affected_rows: 0, execution_time_ms: 1 }]);
    await superseded;

    expect(mocks.historyAdd).not.toHaveBeenCalled();
  });
});
