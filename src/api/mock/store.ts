/**
 * MOCK persistent state — profiles, addresses, orders — kept in localStorage so
 * refreshes behave like a real account. Profiles and address books are keyed by
 * the signed-in email so each account only ever sees its own data (mirroring the
 * real API, where the user row and addresses belong to the authenticated user).
 * Also runs the "kitchen": placed orders advance through the real lifecycle on
 * timers, emitting the same OrderChangedMessage shapes the WebSocket pushes in
 * live mode.
 */
import type { Address, Order, OrderChangedMessage, OrderStatus, User } from '@/api/types'

// v2: state is now keyed per-account (v1 had a single shared user + address list).
const STORAGE_KEY = 'puca-mock-state-v2'

/** The persisted stand-in for a user row — created at signup or first /me sync. */
interface ProfileRecord {
  id: string
  fullName: string | null
  phone: string | null
  createdAt: string
  /**
   * Email-confirmation state, mirroring Cognito: sign-in is refused until the
   * account is confirmed. Absent on records created before this field existed —
   * treated as confirmed so nobody is locked out of an account they were using.
   */
  confirmed?: boolean
  role?: User['role']
  staffMfaEnrolled?: boolean
  staffBranchIds?: string[]
  /** Mirrors Cognito's FORCE_CHANGE_PASSWORD: the account must set a new password at first sign-in. */
  mustSetPassword?: boolean
}

export type ProfileStatus = 'none' | 'unconfirmed' | 'confirmed'

interface MockState {
  /** email → profile. */
  profiles: Record<string, ProfileRecord>
  /** email → that account's saved addresses (empty for a brand-new account). */
  addresses: Record<string, Address[]>
  /** Orders stay a flat list (out of scope; see AGENT_PLAN). */
  orders: Order[]
}

type Listener = (message: OrderChangedMessage) => void

/** Emails are case-insensitive in Cognito — normalise so keys match regardless of casing. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function load(): MockState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MockState>
      return {
        profiles: parsed.profiles ?? {},
        addresses: parsed.addresses ?? {},
        orders: parsed.orders ?? [],
      }
    }
  } catch {
    // corrupted state — start fresh
  }
  return { profiles: {}, addresses: {}, orders: [] }
}

const state: MockState = load()
// The active session's email. Not persisted: the auth provider (SESSION_KEY) is
// the source of truth and pushes it in via signInAs on restore/sign-in.
let currentEmail: string | null = null
const listeners = new Set<Listener>()
const kitchenTimers = new Map<string, ReturnType<typeof setTimeout>[]>()

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function toUser(email: string, record: ProfileRecord): User {
  return {
    id: record.id,
    email,
    fullName: record.fullName,
    phone: record.phone,
    role: record.role ?? 'buyer',
    createdAt: record.createdAt,
  }
}

/**
 * Ensure a profile record exists for an email (the mock's first-login sync).
 * Sign-in requires a confirmed signup, so in practice the record always exists
 * by the time this runs — creation here is defensive only.
 */
function ensureProfile(email: string): ProfileRecord {
  const key = normalizeEmail(email)
  let record = state.profiles[key]
  if (!record) {
    record = {
      id: crypto.randomUUID(),
      fullName: null,
      phone: null,
      createdAt: new Date().toISOString(),
      confirmed: true,
      role: 'buyer',
    }
    state.profiles[key] = record
    persist()
  }
  return record
}

export const mockStore = {
  /**
   * Reload state from localStorage and drop the session. TESTS ONLY: state is
   * module-held, so `localStorage.clear()` alone leaves stale records in memory
   * (a real page load re-runs `load()` and never needs this).
   */
  resetForTests() {
    const fresh = load()
    state.profiles = fresh.profiles
    state.addresses = fresh.addresses
    state.orders = fresh.orders
    currentEmail = null
  },

  /* ---- session identity ------------------------------------------------- */
  get currentEmail() {
    return currentEmail
  },
  /** Bind the active session to an email (called by the mock auth provider). */
  signInAs(email: string) {
    currentEmail = email
  },
  clearSession() {
    currentEmail = null
  },

  /* ---- profile (per-account) -------------------------------------------- */
  /**
   * Capture the signup full name against the email so it survives
   * signup → confirm → sign-in (stands in for the Cognito `name` attribute).
   * The account starts UNCONFIRMED — sign-in is refused until confirmSignUp.
   */
  registerSignup(email: string, fullName: string) {
    const key = normalizeEmail(email)
    const existing = state.profiles[key]
    state.profiles[key] = {
      id: existing?.id ?? crypto.randomUUID(),
      fullName: fullName.trim() || null,
      phone: existing?.phone ?? null,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      confirmed: false,
      role: 'buyer',
    }
    persist()
  },
  /** Confirmation state for an email — sign-in must refuse all but 'confirmed'. */
  profileStatus(email: string): ProfileStatus {
    const record = state.profiles[normalizeEmail(email)]
    if (!record) return 'none'
    // Records predating the `confirmed` field are grandfathered as confirmed.
    return record.confirmed === false ? 'unconfirmed' : 'confirmed'
  },
  profileRole(email: string): User['role'] {
    return state.profiles[normalizeEmail(email)]?.role ?? 'buyer'
  },
  hasStaffMfa(email: string): boolean {
    return state.profiles[normalizeEmail(email)]?.staffMfaEnrolled === true
  },
  setStaffMfa(email: string, enrolled: boolean) {
    const record = ensureProfile(email)
    record.staffMfaEnrolled = enrolled
    persist()
  },
  needsNewPassword(email: string): boolean {
    return state.profiles[normalizeEmail(email)]?.mustSetPassword === true
  },
  clearNewPasswordRequired(email: string) {
    const record = state.profiles[normalizeEmail(email)]
    if (record?.mustSetPassword) {
      record.mustSetPassword = false
      persist()
    }
  },
  /** Seed a privileged Cognito/API identity for focused staff-panel tests. */
  seedStaffForTests(
    email: string,
    role: Extract<User['role'], 'restaurant_staff' | 'admin' | 'restaurant_manager'>,
    options: { mfaEnrolled?: boolean; branchIds?: string[]; mustSetPassword?: boolean } = {},
  ) {
    const key = normalizeEmail(email)
    state.profiles[key] = {
      id: state.profiles[key]?.id ?? crypto.randomUUID(),
      fullName:
        role === 'admin'
          ? 'Platform Admin'
          : role === 'restaurant_manager'
            ? 'Branch Manager'
            : 'Restaurant Staff',
      phone: null,
      createdAt: state.profiles[key]?.createdAt ?? new Date().toISOString(),
      confirmed: true,
      role,
      staffMfaEnrolled: options.mfaEnrolled ?? false,
      staffBranchIds: options.branchIds ?? [],
      mustSetPassword: options.mustSetPassword ?? false,
    }
    persist()
  },
  staffBranchIds(email: string): string[] {
    return [...(state.profiles[normalizeEmail(email)]?.staffBranchIds ?? [])]
  },
  /** Mark the account's email as confirmed (the mock's confirmRegistration). */
  markConfirmed(email: string) {
    const record = state.profiles[normalizeEmail(email)]
    if (record) {
      record.confirmed = true
      persist()
    }
  },
  /** First-login sync: return the account's user, creating the record if needed. */
  syncUser(email: string): User {
    return toUser(email, ensureProfile(email))
  },
  /** Persist PATCH /me edits (only provided fields change), returning the user. */
  updateUser(email: string, patch: { fullName?: string; phone?: string }): User {
    const record = ensureProfile(email)
    if (patch.fullName !== undefined) record.fullName = patch.fullName
    if (patch.phone !== undefined) record.phone = patch.phone
    persist()
    return toUser(email, record)
  },

  /* ---- addresses (per-account) ------------------------------------------ */
  getAddresses(email: string): Address[] {
    return state.addresses[normalizeEmail(email)] ?? []
  },
  addAddress(email: string, address: Address) {
    const key = normalizeEmail(email)
    const list = state.addresses[key] ?? []
    if (address.isDefault) list.forEach((a) => (a.isDefault = false))
    list.push(address)
    state.addresses[key] = list
    persist()
  },
  removeAddress(email: string, addressId: string): boolean {
    const list = state.addresses[normalizeEmail(email)]
    if (!list) return false
    const index = list.findIndex((a) => a.id === addressId)
    if (index === -1) return false
    list.splice(index, 1)
    persist()
    return true
  },

  /* ---- orders ----------------------------------------------------------- */
  get orders() {
    return state.orders
  },
  getOrder(orderId: string) {
    return state.orders.find((o) => o.id === orderId)
  },
  addOrder(order: Order) {
    state.orders.unshift(order)
    persist()
  },

  updateOrderStatus(orderId: string, status: OrderStatus, note: string | null = null) {
    const order = state.orders.find((o) => o.id === orderId)
    if (!order) return
    const previous = order.status
    order.status = status
    order.statusHistory = [...order.statusHistory, { status, at: new Date().toISOString(), note }]
    if (status === 'cancelled' && order.paymentMethod === 'card' && order.paymentStatus === 'paid') {
      order.paymentStatus = 'refund_pending'
      // The refund worker confirms via Stripe webhook in live mode; simulate the lag.
      setTimeout(() => {
        order.paymentStatus = 'refunded'
        persist()
        emit({
          type: 'order.status_changed',
          orderId,
          branchId: order.branchId,
          status: order.status,
          previousStatus: order.status,
          occurredAt: new Date().toISOString(),
        })
      }, 6000)
    }
    persist()
    emit({
      type: status === 'placed' ? 'order.placed' : 'order.status_changed',
      orderId,
      branchId: order.branchId,
      status,
      previousStatus: previous === status ? null : previous,
      occurredAt: new Date().toISOString(),
    })
  },

  /** Simulated kitchen: placed → accepted → preparing → ready/out_for_delivery → completed. */
  startKitchen(orderId: string) {
    const order = state.orders.find((o) => o.id === orderId)
    if (!order) return
    const handoff: OrderStatus = order.fulfillmentType === 'delivery' ? 'out_for_delivery' : 'ready'
    const script: [OrderStatus, number][] = [
      ['accepted', 8_000],
      ['preparing', 20_000],
      [handoff, 45_000],
      ['completed', 75_000],
    ]
    const timers = script.map(([status, delay]) =>
      setTimeout(() => {
        const current = state.orders.find((o) => o.id === orderId)
        // Kitchen never advances a cancelled/rejected order
        if (!current || ['cancelled', 'rejected'].includes(current.status)) return
        this.updateOrderStatus(orderId, status)
      }, delay),
    )
    kitchenTimers.set(orderId, timers)
  },

  stopKitchen(orderId: string) {
    kitchenTimers.get(orderId)?.forEach(clearTimeout)
    kitchenTimers.delete(orderId)
  },

  subscribe(listener: Listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

function emit(message: OrderChangedMessage) {
  listeners.forEach((l) => l(message))
}
