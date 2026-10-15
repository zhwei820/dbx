import type { SpreadsheetColumnData, SpreadsheetColumnSplice, SpreadsheetRecord } from "@/lib/spreadsheet/spreadsheetGrid";

export const SPREADSHEET_HISTORY_LIMIT = 100;

// Changes address rows by physical source index, not record identity: column edits rebuild every record,
// and undo/redo always returns to the exact state a change was recorded against.
export interface SpreadsheetCellChange {
  row: number;
  prop: string;
  before: unknown;
  after: unknown;
}

export interface SpreadsheetRowPatch {
  // Ascending indices in the source before the change, with the removed contents.
  removed: { index: number; record: SpreadsheetRecord }[];
  // Ascending indices in the source after the change, with the inserted contents.
  inserted: { index: number; record: SpreadsheetRecord }[];
}

export type SpreadsheetChange = { kind: "cells"; cells: SpreadsheetCellChange[] } | { kind: "rows"; patch: SpreadsheetRowPatch } | { kind: "columns"; splice: SpreadsheetColumnSplice; removed: SpreadsheetColumnData[] } | { kind: "header"; index: number; before: string; after: string };

export type SpreadsheetHistoryDirection = "undo" | "redo";

export function applySpreadsheetCellChanges(source: readonly SpreadsheetRecord[], cells: readonly SpreadsheetCellChange[], direction: SpreadsheetHistoryDirection) {
  for (const cell of cells) {
    const record = source[cell.row];
    if (record) record[cell.prop] = direction === "undo" ? cell.before : cell.after;
  }
}

// Row edits only insert and remove records, so identity tells which ones changed.
// Contents are copied because later in-place cell edits would otherwise leak into the stored rows.
export function diffSpreadsheetRows(before: readonly SpreadsheetRecord[], after: readonly SpreadsheetRecord[]): SpreadsheetRowPatch {
  const kept = new Set(after);
  const existing = new Set(before);
  return {
    removed: before.flatMap((record, index) => (kept.has(record) ? [] : [{ index, record: { ...record } }])),
    inserted: after.flatMap((record, index) => (existing.has(record) ? [] : [{ index, record: { ...record } }])),
  };
}

// Returns the new source and the records placed back into it, which are fresh copies of the stored rows.
export function applySpreadsheetRowPatch(source: readonly SpreadsheetRecord[], patch: SpreadsheetRowPatch, direction: SpreadsheetHistoryDirection): { source: SpreadsheetRecord[]; restored: SpreadsheetRecord[] } {
  const remove = direction === "redo" ? patch.removed : patch.inserted;
  const insert = direction === "redo" ? patch.inserted : patch.removed;
  const removed = new Set(remove.map((entry) => entry.index));
  const remaining = source.filter((_, index) => !removed.has(index));
  const restored = insert.map((entry) => ({ ...entry.record }));
  const next: SpreadsheetRecord[] = [];
  let cursor = 0;
  insert.forEach((entry, offset) => {
    while (next.length < entry.index && cursor < remaining.length) next.push(remaining[cursor++]);
    next.push(restored[offset]);
  });
  while (cursor < remaining.length) next.push(remaining[cursor++]);
  return { source: next, restored };
}

export function invertColumnSplice(splice: SpreadsheetColumnSplice, removed: readonly SpreadsheetColumnData[]): SpreadsheetColumnSplice {
  return { at: splice.at, remove: splice.insert.length, insert: removed };
}

// Linear undo/redo stack. Every state has an id, so "unsaved" means the current state is not the saved one,
// even after undoing past a save or trimming the oldest entries.
export class SpreadsheetHistory<T> {
  private entries: { id: number; change: T }[] = [];
  private cursor = 0;
  private nextId = 1;
  private baseId = 0;
  private savedId = 0;

  constructor(private readonly limit = SPREADSHEET_HISTORY_LIMIT) {}

  get stateId() {
    return this.cursor === 0 ? this.baseId : this.entries[this.cursor - 1].id;
  }

  get canUndo() {
    return this.cursor > 0;
  }

  get canRedo() {
    return this.cursor < this.entries.length;
  }

  get dirty() {
    return this.stateId !== this.savedId;
  }

  push(change: T) {
    this.entries.length = this.cursor;
    this.entries.push({ id: this.nextId++, change });
    this.cursor++;
    while (this.entries.length > this.limit) {
      this.baseId = this.entries.shift()!.id;
      this.cursor--;
    }
  }

  undo(): T | undefined {
    if (!this.canUndo) return undefined;
    return this.entries[--this.cursor].change;
  }

  redo(): T | undefined {
    if (!this.canRedo) return undefined;
    return this.entries[this.cursor++].change;
  }

  markSaved(stateId = this.stateId) {
    this.savedId = stateId;
  }

  reset() {
    this.entries = [];
    this.cursor = 0;
    this.baseId = this.nextId++;
    this.savedId = this.baseId;
  }
}
