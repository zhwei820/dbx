import { describe, expect, it } from "vitest";
import { showMcpUpdateBadge, showToolbarUpdateAction } from "@/lib/updates/updateBadges";

describe("component update entry badges", () => {
  it("hides the MCP settings badge while MCP automatic updates are enabled", () => {
    expect(showMcpUpdateBadge(true, true)).toBe(false);
    expect(showMcpUpdateBadge(false, true)).toBe(true);
    expect(showMcpUpdateBadge(false, false)).toBe(false);
  });

  it("keeps the toolbar update action hidden while component updates are still running", () => {
    expect(
      showToolbarUpdateAction({
        appUpdateAvailable: false,
        driverUpdateCount: 1,
        jdbcUpdateAvailable: true,
        mcpUpdateAvailable: true,
        pluginUpdateCount: 1,
        componentUpdatesRunning: true,
      }),
    ).toBe(false);
  });

  it("shows the toolbar update action for remaining updates after component updating stops", () => {
    const base = {
      appUpdateAvailable: false,
      driverUpdateCount: 0,
      jdbcUpdateAvailable: false,
      mcpUpdateAvailable: false,
      pluginUpdateCount: 0,
      componentUpdatesRunning: false,
    };

    expect(showToolbarUpdateAction(base)).toBe(false);
    expect(showToolbarUpdateAction({ ...base, appUpdateAvailable: true })).toBe(true);
    expect(showToolbarUpdateAction({ ...base, driverUpdateCount: 1 })).toBe(true);
    expect(showToolbarUpdateAction({ ...base, jdbcUpdateAvailable: true })).toBe(true);
    expect(showToolbarUpdateAction({ ...base, mcpUpdateAvailable: true })).toBe(true);
    expect(showToolbarUpdateAction({ ...base, pluginUpdateCount: 1 })).toBe(true);
  });
});
