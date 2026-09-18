// @vitest-environment happy-dom

import { createApp, defineComponent, h, KeepAlive, markRaw, nextTick, reactive, ref, type App } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSettingsStore } from "@/stores/settingsStore";
import type { QueryResult } from "@/types/database";
import * as api from "@/lib/backend/api";
import DataGrid from "../DataGrid.vue";

const mountedApps: Array<{ app: App; host: HTMLElement }> = [];

function mountGrid(countTotalRows?: () => Promise<number | undefined>) {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  const pinia = createPinia();
  setActivePinia(pinia);
  useSettingsStore().updateEditorSettings({ dataGridRenderMode: "canvas", infiniteScroll: false });
  const active = ref(true);
  const state = reactive({ loading: false, countSql: "SELECT COUNT(*) FROM items" });
  const reload = vi.fn();
  const result = markRaw<QueryResult>({ columns: ["id"], rows: [[1]], affected_rows: 0, execution_time_ms: 0 });
  const host = document.createElement("div");
  document.body.append(host);
  const Root = defineComponent({
    setup() {
      return () =>
        h(TooltipProvider, null, {
          default: () =>
            h(KeepAlive, null, {
              default: () => (active.value ? h(DataGrid, { result, databaseType: "mysql", context: "results", connectionId: "connection", database: "db", pageLimit: 100, countTotalRows, ...state, onReload: reload }) : null),
            }),
        });
    },
  });
  const app = createApp(Root);
  app.use(pinia);
  app.use(i18n);
  app.component("RecycleScroller", defineComponent({ setup: () => () => h("div") }));
  app.mount(host);
  mountedApps.push({ app, host });
  return { app, host, active, state, reload };
}

function refreshButton(host: HTMLElement): HTMLButtonElement {
  const button = Array.from(host.querySelectorAll("button")).find((candidate) => candidate.textContent?.trim() === "5s");
  if (!button) throw new Error("Total row count refresh button not found");
  return button;
}

async function settle() {
  await nextTick();
  await Promise.resolve();
  await nextTick();
}

afterEach(() => {
  for (const { app, host } of mountedApps.splice(0)) {
    app.unmount();
    host.remove();
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("DataGrid total row count auto refresh", () => {
  it("starts only on demand, counts immediately, then updates every five seconds without reloading rows", async () => {
    const count = vi.fn().mockResolvedValueOnce(42).mockResolvedValue(43);
    const { host, reload } = mountGrid(count);
    await settle();
    await vi.advanceTimersByTimeAsync(10000);
    expect(count).not.toHaveBeenCalled();
    expect(refreshButton(host).getAttribute("aria-pressed")).toBe("false");

    refreshButton(host).click();
    await settle();
    expect(count).toHaveBeenCalledOnce();
    expect(host.textContent).toContain(i18n.global.t("grid.totalRowCount", { count: 42 }));
    await vi.advanceTimersByTimeAsync(4999);
    expect(count).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(count).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain(i18n.global.t("grid.totalRowCount", { count: 43 }));
    expect(reload).not.toHaveBeenCalled();

    refreshButton(host).click();
    await vi.advanceTimersByTimeAsync(10000);
    expect(count).toHaveBeenCalledTimes(2);
    expect(refreshButton(host).getAttribute("aria-pressed")).toBe("false");
  });

  it("skips overlapping requests and allows stopping while a count is pending", async () => {
    let resolveCount!: (total: number) => void;
    const count = vi.fn(() => new Promise<number>((resolve) => (resolveCount = resolve)));
    const { host } = mountGrid(count);
    await settle();
    refreshButton(host).click();
    await vi.advanceTimersByTimeAsync(15000);
    expect(count).toHaveBeenCalledOnce();
    expect(host.querySelector('[class~="bg-background/50"]')).toBeNull();

    refreshButton(host).click();
    await settle();
    expect(refreshButton(host).getAttribute("aria-pressed")).toBe("false");
    resolveCount(100);
    await vi.advanceTimersByTimeAsync(10000);
    expect(count).toHaveBeenCalledOnce();
  });

  it("skips loading grids and pauses while its tab is inactive", async () => {
    const count = vi.fn().mockResolvedValue(10);
    const { host, active, state } = mountGrid(count);
    await settle();
    state.loading = true;
    await settle();
    refreshButton(host).click();
    await vi.advanceTimersByTimeAsync(5000);
    expect(count).not.toHaveBeenCalled();
    state.loading = false;
    await vi.advanceTimersByTimeAsync(5000);
    expect(count).toHaveBeenCalledOnce();

    active.value = false;
    await settle();
    await vi.advanceTimersByTimeAsync(10000);
    expect(count).toHaveBeenCalledOnce();
    active.value = true;
    await settle();
    await vi.advanceTimersByTimeAsync(5000);
    expect(count).toHaveBeenCalledTimes(2);
  });

  it("shares the count lock with manual counting and preserves its busy overlay", async () => {
    let resolveCount!: (total: number) => void;
    const count = vi
      .fn()
      .mockImplementationOnce(() => new Promise<number>((resolve) => (resolveCount = resolve)))
      .mockResolvedValue(101);
    const { host } = mountGrid(count);
    await settle();
    const manualButton = Array.from(host.querySelectorAll("button")).find((button) => button.textContent?.trim() === i18n.global.t("grid.calculateTotalRowsInline"));
    expect(manualButton).toBeDefined();
    manualButton!.click();
    await settle();
    expect(host.querySelector('[class~="bg-background/50"]')).not.toBeNull();
    refreshButton(host).click();
    await vi.advanceTimersByTimeAsync(5000);
    expect(count).toHaveBeenCalledOnce();

    resolveCount(100);
    await settle();
    expect(host.querySelector('[class~="bg-background/50"]')).toBeNull();
    await vi.advanceTimersByTimeAsync(5000);
    expect(count).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain(i18n.global.t("grid.totalRowCount", { count: 101 }));
  });

  it("clears the refresh timer when the grid is closed", async () => {
    const count = vi.fn().mockResolvedValue(10);
    const { host } = mountGrid(count);
    await settle();
    refreshButton(host).click();
    await settle();
    const mounted = mountedApps.pop()!;
    mounted.app.unmount();
    mounted.host.remove();
    await vi.advanceTimersByTimeAsync(10000);
    expect(count).toHaveBeenCalledOnce();
  });

  it("discards a count returned after the query context changes", async () => {
    let resolveCount!: (total: number) => void;
    const count = vi
      .fn()
      .mockImplementationOnce(() => new Promise<number>((resolve) => (resolveCount = resolve)))
      .mockResolvedValue(200);
    const { host, state } = mountGrid(count);
    await settle();
    refreshButton(host).click();
    state.countSql = "SELECT COUNT(*) FROM other_items";
    await settle();
    resolveCount(100);
    await settle();
    expect(host.textContent).not.toContain(i18n.global.t("grid.totalRowCount", { count: 100 }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(host.textContent).toContain(i18n.global.t("grid.totalRowCount", { count: 200 }));
  });

  it("uses the current SQL count target and stops automatic retries after an error", async () => {
    const execute = vi
      .spyOn(api, "executeQuery")
      .mockResolvedValueOnce({ columns: ["count"], rows: [[12]], affected_rows: 0, execution_time_ms: 0 })
      .mockRejectedValue(new Error("count failed"));
    const { host } = mountGrid();
    await settle();
    refreshButton(host).click();
    await settle();
    expect(execute.mock.calls[0]?.slice(0, 3)).toEqual(["connection", "db", "SELECT COUNT(*) FROM items"]);
    expect(host.textContent).toContain(i18n.global.t("grid.totalRowCount", { count: 12 }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(refreshButton(host).getAttribute("aria-pressed")).toBe("false");
    await vi.advanceTimersByTimeAsync(10000);
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
