/**
 * Branch memory is PER RESTAURANT (plan §6.2.6): a choice at restaurant A must
 * never leak to restaurant B. `resolveSelectedBranch` is the revalidation
 * primitive — a remembered branch that no longer exists resolves to null (the
 * gate reappears) and a sole branch auto-selects but stays changeable.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { BranchSummary } from '@/api/types'

import { resolveSelectedBranch, useRememberedBranch } from './branch-selection'

const summary = (id: string): BranchSummary => ({
  id,
  name: id,
  town: 'Dublin',
  imageUrl: null,
  isOpen: true,
  fulfillment: { collectionEnabled: true, deliveryEnabled: true },
  payment: { cashEnabled: false },
})

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

describe('useRememberedBranch', () => {
  it('remembers a branch per restaurant without leaking across restaurants', () => {
    const a = renderHook(() => useRememberedBranch('rest-A'))
    const b = renderHook(() => useRememberedBranch('rest-B'))

    expect(a.result.current[0]).toBeNull()
    act(() => a.result.current[1]('branch-A1'))

    a.rerender()
    b.rerender()
    // A remembers its choice; B is untouched.
    expect(a.result.current[0]).toBe('branch-A1')
    expect(b.result.current[0]).toBeNull()

    act(() => b.result.current[1]('branch-B1'))
    a.rerender()
    b.rerender()
    expect(a.result.current[0]).toBe('branch-A1')
    expect(b.result.current[0]).toBe('branch-B1')
  })

  it('no-ops for a null restaurant id (restaurant not resolved yet)', () => {
    const { result } = renderHook(() => useRememberedBranch(null))
    act(() => result.current[1]('branch-X'))
    expect(result.current[0]).toBeNull()
  })
})

describe('resolveSelectedBranch — revalidation', () => {
  it('returns null with no branches', () => {
    expect(resolveSelectedBranch(undefined, 'b1')).toBeNull()
    expect(resolveSelectedBranch([], 'b1')).toBeNull()
  })

  it('keeps a stored id that still exists', () => {
    expect(resolveSelectedBranch([summary('b1'), summary('b2')], 'b2')).toBe('b2')
  })

  it('revalidates away a stale id (branch removed) → null → gate reappears', () => {
    expect(resolveSelectedBranch([summary('b1'), summary('b2')], 'gone')).toBeNull()
  })

  it('auto-selects the sole branch even with no stored choice', () => {
    expect(resolveSelectedBranch([summary('only')], null)).toBe('only')
  })

  it('returns null (the gate) for multiple branches with no valid choice', () => {
    expect(resolveSelectedBranch([summary('b1'), summary('b2')], null)).toBeNull()
  })
})
