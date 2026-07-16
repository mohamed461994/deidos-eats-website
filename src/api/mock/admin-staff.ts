/**
 * MOCK staff-account management (test + preview only; live mode hits the real API). Mirrors the
 * server's shapes and rules where the UX depends on them: create-or-promote by email, declarative
 * membership replace, one-time temp password on create/reset, disable/enable, and branch validation.
 */
import type {
  AdminStaffCreate,
  AdminStaffCreateResult,
  AdminStaffMember,
  AdminStaffMembership,
  AdminStaffMemberUpdate,
  AdminStaffMembershipInput,
  AdminStaffPasswordReset,
  StaffBranchRole,
} from '@/api/types'

import { ApiError } from '../errors'
import { listAdminBranchesForTests, listAdminRestaurantsForTests } from './admin-content'

const TEMP_PASSWORD_EXPIRES_IN_DAYS = 7

let staff = new Map<string, AdminStaffMember>()

function fail(status: number, code: string, message: string, details?: Record<string, unknown>): never {
  throw new ApiError(status, { code, message, ...(details ? { details } : {}) })
}

function timestamp(): string {
  return new Date().toISOString()
}

function tempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*'
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  return [...bytes].map((byte) => chars[byte % chars.length]).join('')
}

function coarseRole(memberships: readonly { role: StaffBranchRole }[]): AdminStaffMember['role'] {
  if (memberships.length === 0) return 'buyer'
  return memberships.some((membership) => membership.role === 'manager') ? 'restaurant_manager' : 'restaurant_staff'
}

/** Resolve memberships to display rows, rejecting unknown or duplicate branches like the server. */
function hydrateMemberships(inputs: readonly AdminStaffMembershipInput[]): AdminStaffMembership[] {
  const branchIds = inputs.map((input) => input.branchId)
  if (new Set(branchIds).size !== branchIds.length) {
    fail(422, 'validation_failed', 'A branch appears more than once in the memberships.')
  }
  const branches = new Map(listAdminBranchesForTests().map((branch) => [branch.id, branch]))
  const restaurantNames = new Map(listAdminRestaurantsForTests().map((restaurant) => [restaurant.id, restaurant.name]))
  const missing = branchIds.filter((id) => !branches.has(id))
  if (missing.length > 0) {
    fail(422, 'validation_failed', 'One or more branches do not exist.', { missingBranchIds: missing })
  }
  return inputs.map((input) => {
    const branch = branches.get(input.branchId)!
    return {
      branchId: branch.id,
      branchName: branch.name,
      restaurantId: branch.restaurantId,
      restaurantName: restaurantNames.get(branch.restaurantId) ?? 'Unknown restaurant',
      role: input.role,
    }
  })
}

function findByEmail(email: string): AdminStaffMember | undefined {
  const normalized = email.trim().toLowerCase()
  return [...staff.values()].find((member) => member.email.toLowerCase() === normalized)
}

function requireMember(userId: string): AdminStaffMember {
  const member = staff.get(userId)
  if (!member) fail(404, 'not_found', 'No such staff account.')
  return member
}

export function resetAdminStaffForTests(): void {
  staff = new Map()
}

export function listAdminStaffForTests(): AdminStaffMember[] {
  return [...staff.values()].map((member) => ({ ...member }))
}

export function createAdminStaffForTests(input: AdminStaffCreate): AdminStaffCreateResult {
  const memberships = hydrateMemberships(input.memberships)
  const existing = findByEmail(input.email)
  if (existing) {
    const promoted: AdminStaffMember = {
      ...existing,
      fullName: input.fullName ?? existing.fullName,
      role: coarseRole(memberships),
      memberships,
    }
    staff.set(promoted.id, promoted)
    return { member: { ...promoted }, created: false, temporaryPassword: null, temporaryPasswordExpiresInDays: null }
  }
  const member: AdminStaffMember = {
    id: crypto.randomUUID(),
    email: input.email.trim().toLowerCase(),
    fullName: input.fullName ?? null,
    role: coarseRole(memberships),
    status: 'active',
    disabledAt: null,
    createdAt: timestamp(),
    memberships,
  }
  staff.set(member.id, member)
  return {
    member: { ...member },
    created: true,
    temporaryPassword: tempPassword(),
    temporaryPasswordExpiresInDays: TEMP_PASSWORD_EXPIRES_IN_DAYS,
  }
}

export function getAdminStaffMemberForTests(userId: string): AdminStaffMember {
  return { ...requireMember(userId) }
}

export function updateAdminStaffMemberForTests(userId: string, input: AdminStaffMemberUpdate): AdminStaffMember {
  const member = requireMember(userId)
  const memberships = hydrateMemberships(input.memberships)
  const updated: AdminStaffMember = { ...member, role: coarseRole(memberships), memberships }
  staff.set(userId, updated)
  return { ...updated }
}

export function resetAdminStaffPasswordForTests(userId: string): AdminStaffPasswordReset {
  requireMember(userId)
  return { temporaryPassword: tempPassword(), expiresInDays: TEMP_PASSWORD_EXPIRES_IN_DAYS }
}

export function disableAdminStaffMemberForTests(userId: string): AdminStaffMember {
  const member = requireMember(userId)
  const updated: AdminStaffMember = { ...member, status: 'disabled', disabledAt: timestamp() }
  staff.set(userId, updated)
  return { ...updated }
}

export function enableAdminStaffMemberForTests(userId: string): AdminStaffMember {
  const member = requireMember(userId)
  const updated: AdminStaffMember = { ...member, status: 'active', disabledAt: null }
  staff.set(userId, updated)
  return { ...updated }
}
