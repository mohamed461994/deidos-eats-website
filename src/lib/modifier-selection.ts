/**
 * Pure selection domain for the menu-item customization wizard — no React, no
 * IO. A TypeScript port of the iOS `ModifierSelectionState`
 * (deidos-eats-ios/.../Browse/BrowseModels.swift), extended with the wizard
 * predicates the stepper needs (auto-advance, satisfiability, step ordering).
 *
 * Selections are held per-group as a `ReadonlyMap<groupId, ReadonlySet<optionId>>`
 * — never one flat set — so a group's count is unambiguous even when two groups
 * share option names. Every function is a plain derivation over that map and the
 * item's `ModifierGroup[]` (whose array order is authoritative — the API
 * pre-sorts; there is no sortOrder field). No price logic lives here: callers
 * feed {@link selectedOptions} into `effectiveUnitPriceCents`.
 */
import type { ModifierGroup, ModifierOption } from '@/api/types'

/** Per-group chosen option ids. Absent key === no selection in that group. */
export type ModifierSelection = ReadonlyMap<string, ReadonlySet<string>>

export function emptySelection(): ModifierSelection {
  return new Map()
}

/** Exactly one choice — renders as radios; auto-advances on pick. */
export function isSingleChoice(group: ModifierGroup): boolean {
  return group.maxSelect === 1
}

/** A fixed multi-count (e.g. Dips 2×2) — auto-advances once the count is hit. */
export function isExactCount(group: ModifierGroup): boolean {
  return group.minSelect === group.maxSelect && group.maxSelect > 1
}

/** Optional groups (min 0) get a visible Skip; required groups gate Next. */
export function isOptional(group: ModifierGroup): boolean {
  return group.minSelect === 0
}

export function isSelected(
  selection: ModifierSelection,
  groupId: string,
  optionId: string,
): boolean {
  return selection.get(groupId)?.has(optionId) ?? false
}

export function selectionCount(selection: ModifierSelection, groupId: string): number {
  return selection.get(groupId)?.size ?? 0
}

/**
 * Would tapping this **unselected** option add it? Drives the tile's disabled
 * state as `!isSelected && !canSelect` (over-cap prevention is proactive, never
 * an error). Single-choice is always selectable when available because a pick
 * *replaces* the current one. NB: a *selected* at-cap multi option returns false
 * here — harmless only because the tile guards with `!isSelected` first.
 */
export function canSelect(
  selection: ModifierSelection,
  group: ModifierGroup,
  option: ModifierOption,
): boolean {
  if (!option.isAvailable) return false
  return isSingleChoice(group) || selectionCount(selection, group.id) < group.maxSelect
}

/**
 * Toggle one option, returning a new selection (immutable). Ports the iOS
 * semantics exactly: unavailable → no-op; already selected → remove; else
 * single-choice replaces the group's pick, multi adds up to `maxSelect` (a tap
 * past the cap is a no-op). Emptying a group drops its key so `selectionCount`
 * and `selectedOptions` never see a stale empty set.
 */
export function toggleOption(
  selection: ModifierSelection,
  group: ModifierGroup,
  option: ModifierOption,
): ModifierSelection {
  if (!option.isAvailable) return selection

  const next = new Map<string, ReadonlySet<string>>(selection)
  const current = selection.get(group.id) ?? new Set<string>()

  if (current.has(option.id)) {
    const reduced = new Set(current)
    reduced.delete(option.id)
    if (reduced.size === 0) next.delete(group.id)
    else next.set(group.id, reduced)
    return next
  }

  if (isSingleChoice(group)) {
    next.set(group.id, new Set([option.id]))
    return next
  }

  if (current.size >= group.maxSelect) return selection
  next.set(group.id, new Set(current).add(option.id))
  return next
}

/** Within the group's own bounds: `min ≤ count ≤ max`. */
export function isSatisfied(selection: ModifierSelection, group: ModifierGroup): boolean {
  const count = selectionCount(selection, group.id)
  return count >= group.minSelect && count <= group.maxSelect
}

/**
 * Can this required group ever be satisfied? False when fewer options are
 * available than `minSelect` (a sold-out required group blocks the wizard).
 * Optional groups (min 0) are always satisfiable.
 */
export function isSatisfiable(group: ModifierGroup): boolean {
  const available = group.options.filter((o) => o.isAvailable).length
  return available >= group.minSelect
}

/**
 * True when the group is complete AND nothing more can be chosen, so the wizard
 * may auto-advance: single-choice at 1, exact-count at its count. Ranged groups
 * (1–2, 0–15) never auto-advance — the buyer decides when they're done.
 */
export function shouldAutoAdvance(selection: ModifierSelection, group: ModifierGroup): boolean {
  const count = selectionCount(selection, group.id)
  if (isSingleChoice(group)) return count === 1
  if (isExactCount(group)) return count === group.maxSelect
  return false
}

export function allSatisfied(selection: ModifierSelection, groups: readonly ModifierGroup[]): boolean {
  return groups.every((g) => isSatisfied(selection, g))
}

/** Index of the first not-yet-satisfied group, or -1 when all are satisfied. */
export function firstUnsatisfied(
  selection: ModifierSelection,
  groups: readonly ModifierGroup[],
): number {
  return groups.findIndex((g) => !isSatisfied(selection, g))
}

/**
 * The chosen options flattened in authoritative order (group order, then option
 * order within each group) — deterministic so cart line keys stay stable. Feeds
 * `effectiveUnitPriceCents` and the cart's `options` payload.
 */
export function selectedOptions(
  selection: ModifierSelection,
  groups: readonly ModifierGroup[],
): ModifierOption[] {
  const chosen: ModifierOption[] = []
  for (const group of groups) {
    const ids = selection.get(group.id)
    if (!ids) continue
    for (const option of group.options) {
      if (ids.has(option.id)) chosen.push(option)
    }
  }
  return chosen
}

/**
 * The count instruction shown under a group name; doubles as the disabled-Next
 * explanation on required steps. Exact ("Choose 2"), open-ended ("Choose up to
 * 15"), or a range with an en dash ("Choose 1–2"). Branch order matters: a 1–1
 * group must read "Choose 1", never fall into the range branch.
 */
export function helperText(group: ModifierGroup): string {
  const { minSelect: min, maxSelect: max } = group
  if (min === max) return `Choose ${min}`
  if (min === 0) return `Choose up to ${max}`
  return `Choose ${min}–${max}`
}

/**
 * The groups that become wizard steps. An **optional** group with no options is
 * dropped (nothing to choose); a **required** group with no options stays — it
 * routes to the unsatisfiable path so the buyer is told, not silently skipped.
 * An item whose groups all drop out has no steps and falls back to plain detail.
 */
export function wizardSteps(groups: readonly ModifierGroup[]): ModifierGroup[] {
  return groups.filter((g) => !(g.minSelect === 0 && g.options.length === 0))
}
