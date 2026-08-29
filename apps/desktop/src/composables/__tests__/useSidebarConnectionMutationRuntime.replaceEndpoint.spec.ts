import { beforeEach, describe, expect, it, vi } from "vitest";
import { shallowRef } from "vue";
import { replaceConnectionEndpointError, replaceConnectionEndpointInput, showReplaceConnectionEndpointDialog } from "@/components/sidebar/sidebarTreeDialogState";
import type { ConnectionConfig, TreeNode } from "@/types/database";

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
}));

vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  }),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

import { useSidebarConnectionMutationRuntime } from "@/composables/useSidebarConnectionMutationRuntime";

function connectionNode(connectionId = "conn-1"): TreeNode {
  return { id: connectionId, label: connectionId, type: "connection", connectionId, isExpanded: true, children: [] };
}

function mysqlConfig(overrides: Partial<ConnectionConfig> = {}): ConnectionConfig {
  return {
    id: "conn-1",
    name: "Prod TMS",
    db_type: "mysql",
    driver_profile: "mysql",
    driver_label: "MySQL",
    host: "10.0.0.1",
    port: 3306,
    username: "app",
    password: "old-secret",
    database: "shop",
    ...overrides,
  };
}

function connectionStore(config: ConnectionConfig | undefined, connectedIds: string[] = []) {
  return {
    selectedTreeNodeIds: [] as string[],
    selectedTreeNodeId: null as string | null,
    connectedIds: new Set(connectedIds),
    connectingIds: new Set<string>(),
    getConfig: vi.fn(() => config),
    disconnect: vi.fn().mockResolvedValue(undefined),
    updateConnection: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue("conn-1"),
    loadDatabases: vi.fn().mockResolvedValue(undefined),
    isTreeNodeChildrenLoaded: vi.fn(() => false),
    isDefaultDatabase: vi.fn(() => false),
  };
}

function runtime(node: TreeNode, store: ReturnType<typeof connectionStore>) {
  return useSidebarConnectionMutationRuntime({
    activeNode: shallowRef(node),
    releaseActiveNodeReference: vi.fn(),
    selectedTreeNodesInVisibleOrder: () => [],
    connectionStore: store as any,
    queryStore: { openDatabaseKeys: new Set<string>() } as any,
    requestGroupRename: vi.fn(),
    openVisibleDatabases: vi.fn(),
    openVisibleSchemas: vi.fn(),
  });
}

beforeEach(() => {
  mocks.toast.mockClear();
  showReplaceConnectionEndpointDialog.value = false;
  replaceConnectionEndpointInput.value = "";
  replaceConnectionEndpointError.value = "";
});

describe("replace connection endpoint availability", () => {
  it("is offered on a mysql connection node", () => {
    expect(runtime(connectionNode(), connectionStore(mysqlConfig())).canReplaceConnectionEndpoint.value).toBe(true);
  });

  it("is withheld for other database families and for non-connection nodes", () => {
    expect(runtime(connectionNode(), connectionStore(mysqlConfig({ db_type: "postgres" }))).canReplaceConnectionEndpoint.value).toBe(false);
    const databaseNode: TreeNode = { id: "conn-1:shop", label: "shop", type: "database", connectionId: "conn-1", database: "shop", isExpanded: false, children: [] };
    expect(runtime(databaseNode, connectionStore(mysqlConfig())).canReplaceConnectionEndpoint.value).toBe(false);
  });
});

describe("opening the replace connection dialog", () => {
  it("seeds the input with the connection's own client command", () => {
    runtime(connectionNode(), connectionStore(mysqlConfig({ host: "localhost", port: 32883, username: "root", password: "123456", database: "tms" }))).openReplaceConnectionEndpointDialog();
    expect(replaceConnectionEndpointInput.value).toBe("mycli -hlocalhost -P32883 -uroot -p123456 tms");
    expect(showReplaceConnectionEndpointDialog.value).toBe(true);
  });

  it("clears a stale error from a previous attempt", () => {
    replaceConnectionEndpointError.value = "connection.replaceEndpointEmpty";
    runtime(connectionNode(), connectionStore(mysqlConfig())).openReplaceConnectionEndpointDialog();
    expect(replaceConnectionEndpointError.value).toBe("");
  });
});

describe("confirming a connection endpoint replacement", () => {
  it("drops the live session, saves the new endpoint, then reconnects and reloads", async () => {
    const store = connectionStore(mysqlConfig(), ["conn-1"]);
    const { openReplaceConnectionEndpointDialog, confirmReplaceConnectionEndpoint } = runtime(connectionNode(), store);
    openReplaceConnectionEndpointDialog();
    replaceConnectionEndpointInput.value = "mycli -hlocalhost -P32883 -uroot -p123456 tms";

    await confirmReplaceConnectionEndpoint();

    expect(store.disconnect).toHaveBeenCalledWith("conn-1");
    expect(store.updateConnection).toHaveBeenCalledWith(expect.objectContaining({ id: "conn-1", name: "Prod TMS", host: "localhost", port: 32883, username: "root", password: "123456", database: "tms" }));
    expect(store.connect).toHaveBeenCalledWith(expect.objectContaining({ host: "localhost", port: 32883 }));
    expect(store.loadDatabases).toHaveBeenCalledWith("conn-1", { force: true });
    expect(showReplaceConnectionEndpointDialog.value).toBe(false);
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining("connection.replaceEndpointApplied"), 2000);
  });

  it("only saves when the connection was not open", async () => {
    const store = connectionStore(mysqlConfig());
    const { confirmReplaceConnectionEndpoint } = runtime(connectionNode(), store);
    replaceConnectionEndpointInput.value = "mycli -hdb.internal -P3307 -uroot -ppw tms";

    await confirmReplaceConnectionEndpoint();

    expect(store.disconnect).not.toHaveBeenCalled();
    expect(store.connect).not.toHaveBeenCalled();
    expect(store.loadDatabases).not.toHaveBeenCalled();
    expect(store.updateConnection).toHaveBeenCalledWith(expect.objectContaining({ host: "db.internal", port: 3307 }));
  });

  it("keeps the dialog open with an error when the input cannot be parsed", async () => {
    const store = connectionStore(mysqlConfig(), ["conn-1"]);
    const { openReplaceConnectionEndpointDialog, confirmReplaceConnectionEndpoint } = runtime(connectionNode(), store);
    openReplaceConnectionEndpointDialog();
    replaceConnectionEndpointInput.value = "mycli --version";

    await confirmReplaceConnectionEndpoint();

    expect(replaceConnectionEndpointError.value).toContain("connection.parseConnectionUrlFailed");
    expect(showReplaceConnectionEndpointDialog.value).toBe(true);
    expect(store.disconnect).not.toHaveBeenCalled();
    expect(store.updateConnection).not.toHaveBeenCalled();
  });

  it("refuses a connection string from another database family", async () => {
    const store = connectionStore(mysqlConfig(), ["conn-1"]);
    const { openReplaceConnectionEndpointDialog, confirmReplaceConnectionEndpoint } = runtime(connectionNode(), store);
    openReplaceConnectionEndpointDialog();
    replaceConnectionEndpointInput.value = "postgresql://root:pw@db.example.com:5432/shop";

    await confirmReplaceConnectionEndpoint();

    expect(replaceConnectionEndpointError.value).toContain("connection.replaceEndpointTypeMismatch");
    expect(store.updateConnection).not.toHaveBeenCalled();
  });

  it("reports a failed reconnect without rolling the saved endpoint back", async () => {
    const store = connectionStore(mysqlConfig(), ["conn-1"]);
    store.connect.mockRejectedValue(new Error("connection refused"));
    const { confirmReplaceConnectionEndpoint } = runtime(connectionNode(), store);
    replaceConnectionEndpointInput.value = "mycli -hlocalhost -P32883 -uroot -p123456 tms";

    await confirmReplaceConnectionEndpoint();

    expect(store.updateConnection).toHaveBeenCalled();
    expect(showReplaceConnectionEndpointDialog.value).toBe(false);
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining("connection.connectFailed"), 5000);
  });
});
