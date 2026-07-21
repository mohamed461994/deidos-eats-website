import { describe, expect, it } from 'vitest'

import type { ModifierGroup, ModifierOption } from '@/api/types'
import {
  allSatisfied,
  canSelect,
  emptySelection,
  firstUnsatisfied,
  helperText,
  isExactCount,
  isOptional,
  isSatisfiable,
  isSatisfied,
  isSelected,
  isSingleChoice,
  selectedOptions,
  selectionCount,
  shouldAutoAdvance,
  toggleOption,
  wizardSteps,
} from './modifier-selection'

/* ---- Fixtures ---------------------------------------------------------- */

function option(id: string, isAvailable = true, priceDeltaCents = 0): ModifierOption {
  return { id, name: id, priceDeltaCents, isAvailable }
}

function group(
  id: string,
  minSelect: number,
  maxSelect: number,
  options: ModifierOption[],
): ModifierGroup {
  return { id, name: id, minSelect, maxSelect, options }
}

// Size — required single choice (1×1).
const size = group('size', 1, 1, [option('regular'), option('large', true, 300)])
// Optional single choice (0×1).
const crust = group('crust', 0, 1, [option('thin'), option('stuffed', true, 200)])
// Sauce — required single choice with one sold-out option.
const sauce = group('sauce', 1, 1, [option('tomato'), option('garlic', false)])
// Toppings — ranged (1–2).
const toppings = group('toppings', 1, 2, [option('pepperoni'), option('olives'), option('ham')])
// Extras — optional open-ended (0–15).
const extras = group('extras', 0, 15, [option('cheese'), option('chilli'), option('rocket')])
// Dips — exact count (2×2).
const dips = group('dips', 2, 2, [option('aioli'), option('honey'), option('pesto')])

/** Build a selection map from `[groupId, ...optionIds]` tuples. */
function selectionOf(...entries: [string, ...string[]][]) {
  return new Map(entries.map(([g, ...ids]) => [g, new Set(ids)]))
}

/* ---- Shape predicates -------------------------------------------------- */

describe('shape predicates', () => {
  it('isSingleChoice is max===1', () => {
    expect(isSingleChoice(size)).toBe(true)
    expect(isSingleChoice(crust)).toBe(true)
    expect(isSingleChoice(toppings)).toBe(false)
    expect(isSingleChoice(dips)).toBe(false)
  })

  it('isExactCount is min===max>1', () => {
    expect(isExactCount(dips)).toBe(true)
    expect(isExactCount(size)).toBe(false) // 1×1 is single-choice, not exact-count
    expect(isExactCount(toppings)).toBe(false)
    expect(isExactCount(extras)).toBe(false)
  })

  it('isOptional is min===0', () => {
    expect(isOptional(crust)).toBe(true)
    expect(isOptional(extras)).toBe(true)
    expect(isOptional(size)).toBe(false)
    expect(isOptional(toppings)).toBe(false)
  })
})

/* ---- toggleOption ------------------------------------------------------ */

describe('toggleOption', () => {
  it('adds an option to a multi group', () => {
    const s = toggleOption(emptySelection(), toppings, option('pepperoni'))
    expect(isSelected(s, 'toppings', 'pepperoni')).toBe(true)
    expect(selectionCount(s, 'toppings')).toBe(1)
  })

  it('removes an already-selected option and drops the emptied group key', () => {
    const s1 = toggleOption(emptySelection(), toppings, option('pepperoni'))
    const s2 = toggleOption(s1, toppings, option('pepperoni'))
    expect(isSelected(s2, 'toppings', 'pepperoni')).toBe(false)
    expect(selectionCount(s2, 'toppings')).toBe(0)
    expect(s2.has('toppings')).toBe(false)
  })

  it('single-choice replaces the previous pick', () => {
    const s1 = toggleOption(emptySelection(), size, option('regular'))
    const s2 = toggleOption(s1, size, option('large'))
    expect(isSelected(s2, 'size', 'regular')).toBe(false)
    expect(isSelected(s2, 'size', 'large')).toBe(true)
    expect(selectionCount(s2, 'size')).toBe(1)
  })

  it('blocks a multi selection past the cap (no-op)', () => {
    let s = toggleOption(emptySelection(), toppings, option('pepperoni'))
    s = toggleOption(s, toppings, option('olives'))
    const before = s
    s = toggleOption(s, toppings, option('ham')) // 3rd pick, cap is 2
    expect(s).toBe(before) // same reference — nothing changed
    expect(selectionCount(s, 'toppings')).toBe(2)
  })

  it('ignores an unavailable option (no-op)', () => {
    const s = emptySelection()
    expect(toggleOption(s, sauce, option('garlic', false))).toBe(s)
  })

  it('never mutates the input map', () => {
    const s = emptySelection()
    toggleOption(s, toppings, option('pepperoni'))
    expect(s.size).toBe(0)
  })
})

/* ---- canSelect --------------------------------------------------------- */

describe('canSelect', () => {
  it('single-choice: any available option is selectable (it replaces)', () => {
    const s = toggleOption(emptySelection(), size, option('regular'))
    expect(canSelect(s, size, option('large'))).toBe(true)
  })

  it('multi: selectable while below cap, blocked at cap', () => {
    let s = emptySelection()
    expect(canSelect(s, toppings, option('pepperoni'))).toBe(true)
    s = toggleOption(s, toppings, option('pepperoni'))
    s = toggleOption(s, toppings, option('olives'))
    expect(canSelect(s, toppings, option('ham'))).toBe(false) // at cap 2
  })

  it('unavailable options are never selectable', () => {
    expect(canSelect(emptySelection(), sauce, option('garlic', false))).toBe(false)
  })
})

/* ---- isSatisfied ------------------------------------------------------- */

describe('isSatisfied', () => {
  it('required single-choice: unmet at 0, met at 1', () => {
    expect(isSatisfied(emptySelection(), size)).toBe(false)
    expect(isSatisfied(selectionOf(['size', 'regular']), size)).toBe(true)
  })

  it('ranged 1–2: unmet at 0, met at 1 and 2', () => {
    expect(isSatisfied(emptySelection(), toppings)).toBe(false)
    expect(isSatisfied(selectionOf(['toppings', 'pepperoni']), toppings)).toBe(true)
    expect(isSatisfied(selectionOf(['toppings', 'pepperoni', 'olives']), toppings)).toBe(true)
  })

  it('exact 2×2: unmet at 1, met at 2', () => {
    expect(isSatisfied(selectionOf(['dips', 'aioli']), dips)).toBe(false)
    expect(isSatisfied(selectionOf(['dips', 'aioli', 'honey']), dips)).toBe(true)
  })

  it('optional 0–15: satisfied at 0', () => {
    expect(isSatisfied(emptySelection(), extras)).toBe(true)
  })
})

/* ---- isSatisfiable ----------------------------------------------------- */

describe('isSatisfiable', () => {
  it('is true when enough options are available', () => {
    expect(isSatisfiable(size)).toBe(true)
    expect(isSatisfiable(sauce)).toBe(true) // needs 1, has 1 available
  })

  it('is false when available options < minSelect', () => {
    const soldOutRequired = group('x', 2, 2, [option('a'), option('b', false)])
    expect(isSatisfiable(soldOutRequired)).toBe(false) // needs 2, only 1 available
  })

  it('optional groups are always satisfiable', () => {
    const allSoldOut = group('x', 0, 3, [option('a', false), option('b', false)])
    expect(isSatisfiable(allSoldOut)).toBe(true)
  })
})

/* ---- shouldAutoAdvance (the discriminating matrix, §7) ------------------ */

describe('shouldAutoAdvance', () => {
  it('1×1 required: true once one is picked', () => {
    expect(shouldAutoAdvance(emptySelection(), size)).toBe(false)
    expect(shouldAutoAdvance(selectionOf(['size', 'regular']), size)).toBe(true)
  })

  it('0×1 optional: true once one is picked', () => {
    expect(shouldAutoAdvance(emptySelection(), crust)).toBe(false)
    expect(shouldAutoAdvance(selectionOf(['crust', 'thin']), crust)).toBe(true)
  })

  it('2×2 exact: false at 1, true at 2', () => {
    expect(shouldAutoAdvance(selectionOf(['dips', 'aioli']), dips)).toBe(false)
    expect(shouldAutoAdvance(selectionOf(['dips', 'aioli', 'honey']), dips)).toBe(true)
  })

  it('1–2 ranged: never', () => {
    expect(shouldAutoAdvance(selectionOf(['toppings', 'pepperoni']), toppings)).toBe(false)
    expect(shouldAutoAdvance(selectionOf(['toppings', 'pepperoni', 'olives']), toppings)).toBe(false)
  })

  it('0–15 open-ended: never', () => {
    expect(shouldAutoAdvance(selectionOf(['extras', 'cheese']), extras)).toBe(false)
  })
})

/* ---- allSatisfied / firstUnsatisfied ----------------------------------- */

describe('allSatisfied / firstUnsatisfied', () => {
  const groups = [size, toppings, dips]

  it('allSatisfied only when every group is within bounds', () => {
    expect(allSatisfied(emptySelection(), groups)).toBe(false)
    const complete = selectionOf(
      ['size', 'regular'],
      ['toppings', 'pepperoni'],
      ['dips', 'aioli', 'honey'],
    )
    expect(allSatisfied(complete, groups)).toBe(true)
  })

  it('firstUnsatisfied returns the earliest gap, or -1 when complete', () => {
    expect(firstUnsatisfied(emptySelection(), groups)).toBe(0)
    expect(firstUnsatisfied(selectionOf(['size', 'regular']), groups)).toBe(1)
    const complete = selectionOf(
      ['size', 'regular'],
      ['toppings', 'pepperoni'],
      ['dips', 'aioli', 'honey'],
    )
    expect(firstUnsatisfied(complete, groups)).toBe(-1)
  })
})

/* ---- selectedOptions (group-order flatten) ----------------------------- */

describe('selectedOptions', () => {
  it('flattens in group order, then option order within each group', () => {
    const groups = [size, toppings, dips]
    // Deliberately insert in a scrambled order; output must follow array order.
    const selection = selectionOf(
      ['dips', 'honey', 'aioli'],
      ['size', 'large'],
      ['toppings', 'olives', 'pepperoni'],
    )
    expect(selectedOptions(selection, groups).map((o) => o.id)).toEqual([
      'large', // size
      'pepperoni', // toppings, in group option order
      'olives',
      'aioli', // dips, in group option order
      'honey',
    ])
  })

  it('is empty for an empty selection', () => {
    expect(selectedOptions(emptySelection(), [size, toppings])).toEqual([])
  })
})

/* ---- helperText (exact strings) ---------------------------------------- */

describe('helperText', () => {
  it('renders exact / open-ended / range copy with an en dash', () => {
    expect(helperText(size)).toBe('Choose 1') // 1×1 → exact, not a range
    expect(helperText(dips)).toBe('Choose 2') // 2×2
    expect(helperText(extras)).toBe('Choose up to 15') // 0–15
    expect(helperText(crust)).toBe('Choose up to 1') // 0×1
    expect(helperText(toppings)).toBe('Choose 1–2') // en dash U+2013
    expect(helperText(toppings)).toContain('–')
  })
})

/* ---- wizardSteps ------------------------------------------------------- */

describe('wizardSteps', () => {
  it('drops optional groups with no options, keeps everything else', () => {
    const emptyOptional = group('empty-opt', 0, 3, [])
    const emptyRequired = group('empty-req', 1, 1, [])
    const steps = wizardSteps([size, emptyOptional, toppings, emptyRequired])
    expect(steps.map((g) => g.id)).toEqual(['size', 'toppings', 'empty-req'])
  })
})
