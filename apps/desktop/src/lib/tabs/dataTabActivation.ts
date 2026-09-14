import type { QueryTab } from "@/types/database";
import { isQueryExecutionErrorResult } from "@/lib/query/queryResultError";
import type { DataTabReuseMode } from "@/lib/tabs/dataTabReuseMode";

export type DataTableDoubleClickAction = "activate" | "open" | "none";

export function canActivateExistingDataTableTab(tab: QueryTab, options: { activateExecuting?: boolean } = {}): boolean {
  if (tab.isExecuting) return options.activateExecuting !== false;
  if (tab.result && isQueryExecutionErrorResult(tab.result)) return false;
  return !!tab.result || !!tab.results?.length;
}

/**
 * 在侧边树上重新点击一张已经打开的表时，是否可以自动重跑该 tab 的查询。
 *
 * 忙碌的 tab 不打断（在途查询/取消/EXPLAIN 仍然只做激活）；处于事务、有未提交
 * 数据改动或未保存编辑草稿的 tab 也不刷新——重跑查询会静默丢弃这些改动。工具栏
 * 的刷新按钮是显式操作，可以先 discard 再重载；树上点击是隐式触发，不可以。
 */
export function canAutoRefreshReopenedDataTab(tab: Pick<QueryTab, "isExecuting" | "isCancelling" | "isExplaining" | "txnSessionId" | "pendingDataChangeCount" | "hasPendingDataEditorDraft">): boolean {
  return !tab.isExecuting && !tab.isCancelling && !tab.isExplaining && !tab.txnSessionId && !tab.pendingDataChangeCount && !tab.hasPendingDataEditorDraft;
}

export function dataTableDoubleClickAction(tab: QueryTab | undefined, activation: "single" | "double", reuseMode: DataTabReuseMode = "same-table"): DataTableDoubleClickAction {
  if (activation === "single") return "none";
  if (reuseMode === "always-new") return "open";
  if (!tab) return activation === "double" ? "open" : "none";
  if (!canActivateExistingDataTableTab(tab)) return "open";
  return "activate";
}
