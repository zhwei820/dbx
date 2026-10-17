// @vitest-environment happy-dom
import { it, expect } from "vitest";
import { createApp, h } from "vue";
import { VGrid } from "@revolist/vue3-datagrid";
import { filterCoreFunctionsIndexedByType, filterNames, filterTypes } from "@revolist/revogrid";

it("probe", async () => {
  const picked: any = (v: any, e: any) => filterCoreFunctionsIndexedByType.eq(v, e);
  picked.extra = (hh: any) => hh("select", { class: "probe-select" }, [hh("option", { value: "x" }, "x")]);
  const cfg = { customFilters: Object.fromEntries(filterTypes.string.map((t) => [t, { columnFilterType: "spreadsheet", name: filterNames[t], func: t === "eq" ? picked : filterCoreFunctionsIndexedByType[t] }])) };
  const el = document.createElement("div");
  document.body.appendChild(el);
  createApp({ render: () => h(VGrid as any, { filter: cfg, columns: [{ prop: "c0", name: "A", filter: "spreadsheet" }], source: [{ c0: "x" }] }) }).mount(el);
  let grid: any;
  for (let i = 0; i < 100 && !(grid = el.querySelector("revo-grid"))?.getPlugins; i++) await new Promise((r) => setTimeout(r, 50));
  console.log("filter prop type:", typeof grid?.filter, "attr:", grid?.getAttribute("filter"));
  await new Promise((r) => setTimeout(r, 500));
  const plugins = await grid.getPlugins();
  const fp = plugins.find((p: any) => p.filterFunctionsIndexedByType);
  console.log("eq is ours:", fp?.filterFunctionsIndexedByType.eq === picked, "groups:", JSON.stringify(fp?.filterByType));
  const panel: any = grid.querySelector("revogr-filter-panel");
  console.log("panel entities eq ours:", panel?.filterEntities?.eq === picked);
  await panel.show({ prop: "c0", x: 0, y: 0, filterTypes: { spreadsheet: fp.filterByType.spreadsheet }, filterItems: { c0: [{ id: 0, type: "eq", value: "" }] } });
  await new Promise((r) => setTimeout(r, 300));
  console.log("html:", panel.innerHTML.slice(0, 1500));
  expect(fp).toBeTruthy();
}, 20000);
