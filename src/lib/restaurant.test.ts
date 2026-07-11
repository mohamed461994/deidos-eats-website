/**
 * Availability badges must be PRECISE at N≥2 — never a group-level "open" that
 * hides a closed branch (plan §6.2.2). These pin the exact label per state.
 */
import { describe, expect, it } from 'vitest'

import type { BranchSummary, Restaurant } from '@/api/types'
import { availabilityOf, branchTowns } from './restaurant'

function branch(id: string, isOpen: boolean, town: string): BranchSummary {
  return {
    id,
    name: id,
    town,
    imageUrl: null,
    isOpen,
    fulfillment: { collectionEnabled: true, deliveryEnabled: true },
    payment: { cashEnabled: false },
  }
}

function restaurant(
  status: Restaurant['marketplaceStatus'],
  branches: BranchSummary[],
): Restaurant {
  return {
    id: 'r',
    slug: 'r',
    name: 'R',
    marketplaceStatus: status,
    branches,
  }
}

describe('availabilityOf', () => {
  it('reports coming-soon and cannot order', () => {
    const a = availabilityOf(restaurant('comingSoon', []))
    expect(a).toMatchObject({ label: 'Coming soon', tone: 'comingSoon', canOrderNow: false })
  })

  it('reports paused and cannot order', () => {
    const a = availabilityOf(restaurant('paused', [branch('b1', true, 'Dublin')]))
    expect(a).toMatchObject({ label: 'Not taking orders', tone: 'paused', canOrderNow: false })
  })

  it('reports no locations when accepting but branchless', () => {
    const a = availabilityOf(restaurant('acceptingOrders', []))
    expect(a).toMatchObject({ label: 'No locations yet', tone: 'none', canOrderNow: false })
  })

  it('says "Open now" for a single open branch', () => {
    const a = availabilityOf(restaurant('acceptingOrders', [branch('b1', true, 'Dublin')]))
    expect(a).toMatchObject({ label: 'Open now', tone: 'open', canOrderNow: true })
  })

  it('says "All N locations open" when every branch is open', () => {
    const a = availabilityOf(
      restaurant('acceptingOrders', [branch('b1', true, 'Dublin'), branch('b2', true, 'Cork')]),
    )
    expect(a).toMatchObject({ label: 'All 2 locations open', tone: 'open', canOrderNow: true })
  })

  it('says "1 of 2 locations open" for a partial open — never a group-level claim', () => {
    const a = availabilityOf(
      restaurant('acceptingOrders', [branch('b1', true, 'Dublin'), branch('b2', false, 'Cork')]),
    )
    expect(a).toMatchObject({ label: '1 of 2 locations open', tone: 'partial', canOrderNow: true })
  })

  it('says "Closed right now" and cannot order when all branches are closed', () => {
    const a = availabilityOf(
      restaurant('acceptingOrders', [branch('b1', false, 'Dublin'), branch('b2', false, 'Cork')]),
    )
    expect(a).toMatchObject({ label: 'Closed right now', tone: 'closed', canOrderNow: false })
  })
})

describe('branchTowns', () => {
  it('lists distinct towns', () => {
    const r = restaurant('acceptingOrders', [
      branch('b1', true, 'Dublin'),
      branch('b2', true, 'Dublin'),
      branch('b3', true, 'Cork'),
    ])
    expect(branchTowns(r)).toEqual(['Dublin', 'Cork'])
  })
})
