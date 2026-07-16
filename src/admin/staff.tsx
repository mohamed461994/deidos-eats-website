import { Check, Copy, KeyRound, Plus, Trash2, UserPlus, Users } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'

import { errorMessage } from '@/api'
import type {
  AdminStaffCreate,
  AdminStaffMember,
  AdminStaffMembershipInput,
  StaffBranchRole,
} from '@/api/types'
import { EmptyState, ErrorState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/dialog'
import { SelectField, TextField } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'

import {
  useAccessibleBranches,
  useAdminStaff,
  useCreateAdminStaff,
  useResetAdminStaffPassword,
  useSetAdminStaffDisabled,
  useUpdateAdminStaffMemberships,
  type AccessibleBranch,
} from './queries'
import { AdminCard, AdminPage, ConfirmAction, DetailLabel, PageHeader } from './shared'

const TEMP_PASSWORD_DEFAULT_EXPIRY_DAYS = 7

type MembershipDraft = { branchId: string; role: StaffBranchRole }

/** One issued temporary password to reveal exactly once. */
type RevealedPassword = { email: string; value: string; expiresInDays: number }

function roleBadge(member: AdminStaffMember) {
  if (member.role === 'restaurant_manager') return <Badge variant="basil-soft">Manager</Badge>
  if (member.role === 'restaurant_staff') return <Badge variant="crust">Kitchen</Badge>
  return <Badge variant="neutral">No role</Badge>
}

function branchLabel(branch: AccessibleBranch): string {
  const place = branch.town ? ` · ${branch.town}` : ''
  return `${branch.restaurantName} — ${branch.name}${place}`
}

function normalizeMemberships(drafts: MembershipDraft[]): AdminStaffMembershipInput[] {
  return drafts.filter((draft) => draft.branchId).map((draft) => ({ branchId: draft.branchId, role: draft.role }))
}

function duplicateBranch(memberships: AdminStaffMembershipInput[]): boolean {
  const ids = memberships.map((membership) => membership.branchId)
  return new Set(ids).size !== ids.length
}

// --- Membership editor ---------------------------------------------------------------------------

function MembershipRows({
  drafts,
  branches,
  onChange,
}: {
  drafts: MembershipDraft[]
  branches: AccessibleBranch[]
  onChange: (drafts: MembershipDraft[]) => void
}) {
  function update(index: number, patch: Partial<MembershipDraft>) {
    onChange(drafts.map((draft, draftIndex) => (draftIndex === index ? { ...draft, ...patch } : draft)))
  }

  return (
    <fieldset className="rounded-[16px] border border-border bg-surface p-4">
      <legend className="px-1 text-sm font-[650] text-ink">Branch access</legend>
      <p className="mb-3 text-[13px] text-muted">
        One row per branch. A <strong className="text-ink">Manager</strong> can set that branch’s online
        discounts; <strong className="text-ink">Kitchen</strong> handles orders on the dashboard and Orderpad.
      </p>
      {drafts.length === 0 ? (
        <p className="mb-3 rounded-[10px] bg-bg px-3 py-2.5 text-[13px] text-muted">
          No branches — saving with none removes all staff access and returns this account to a plain buyer.
        </p>
      ) : (
        <div className="space-y-2">
          {drafts.map((draft, index) => (
            <div key={index} className="flex flex-wrap items-end gap-2 rounded-[12px] bg-bg px-3 py-2.5">
              <SelectField
                label="Branch"
                className="min-w-52 flex-1 [&>label]:sr-only"
                value={draft.branchId}
                onChange={(event) => update(index, { branchId: event.target.value })}
              >
                <option value="">Select a branch…</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branchLabel(branch)}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Role"
                className="w-36 [&>label]:sr-only"
                value={draft.role}
                onChange={(event) => update(index, { role: event.target.value as StaffBranchRole })}
              >
                <option value="staff">Kitchen</option>
                <option value="manager">Manager</option>
              </SelectField>
              <button
                type="button"
                aria-label="Remove branch"
                className="grid size-11 shrink-0 place-items-center rounded-[10px] text-muted transition-colors hover:bg-surface hover:text-error"
                onClick={() => onChange(drafts.filter((_, draftIndex) => draftIndex !== index))}
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-3"
        onClick={() => onChange([...drafts, { branchId: '', role: 'staff' }])}
      >
        <Plus className="size-4" aria-hidden />
        Add branch
      </Button>
    </fieldset>
  )
}

// --- Create / edit editor ------------------------------------------------------------------------

function StaffEditor({
  member,
  branches,
  onClose,
  onPasswordIssued,
}: {
  member: AdminStaffMember | null
  branches: AccessibleBranch[]
  onClose: () => void
  onPasswordIssued: (revealed: RevealedPassword) => void
}) {
  const { toast } = useToast()
  const createStaff = useCreateAdminStaff()
  const updateMemberships = useUpdateAdminStaffMemberships()
  const [email, setEmail] = useState(member?.email ?? '')
  const [fullName, setFullName] = useState(member?.fullName ?? '')
  const [drafts, setDrafts] = useState<MembershipDraft[]>(
    member
      ? member.memberships.map((membership) => ({ branchId: membership.branchId, role: membership.role }))
      : [{ branchId: '', role: 'staff' }],
  )
  const [error, setError] = useState<string | null>(null)
  const isEdit = member !== null
  const saving = createStaff.isPending || updateMemberships.isPending

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const memberships = normalizeMemberships(drafts)
    if (duplicateBranch(memberships)) {
      setError('Each branch can appear only once.')
      return
    }
    if (!isEdit && memberships.length === 0) {
      setError('Assign at least one branch to a new account.')
      return
    }
    try {
      if (isEdit) {
        await updateMemberships.mutateAsync({ userId: member.id, input: { memberships } })
        toast('Branch access updated.')
        onClose()
        return
      }
      const trimmedEmail = email.trim().toLowerCase()
      const create: AdminStaffCreate = {
        email: trimmedEmail,
        ...(fullName.trim() ? { fullName: fullName.trim() } : {}),
        memberships,
      }
      const result = await createStaff.mutateAsync(create)
      toast(result.created ? 'Staff account created.' : 'Existing account promoted to staff.')
      if (result.temporaryPassword) {
        onPasswordIssued({
          email: result.member.email,
          value: result.temporaryPassword,
          expiresInDays: result.temporaryPasswordExpiresInDays ?? TEMP_PASSWORD_DEFAULT_EXPIRY_DAYS,
        })
      }
      // Drop the response (and its one-time password) from the mutation cache now that it's in the
      // reveal modal's local state.
      createStaff.reset()
      onClose()
    } catch (saveError) {
      setError(errorMessage(saveError))
    }
  }

  return (
    <AdminCard className="mt-6 overflow-hidden">
      <form onSubmit={submit} noValidate>
        <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-[700]">{isEdit ? `Edit ${member.email}` : 'Add a staff account'}</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              {isEdit
                ? 'Change which branches this account can work, and as what.'
                : 'Creates a Cognito account (or promotes an existing one) and assigns branch access.'}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>
            Close
          </Button>
        </div>
        <div className="space-y-5 p-5 sm:p-6">
          {isEdit ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <DetailLabel>Email</DetailLabel>
                <p className="mt-1 truncate text-[14px]">{member.email}</p>
              </div>
              <div>
                <DetailLabel>Name</DetailLabel>
                <p className="mt-1 text-[14px]">{member.fullName ?? 'Not set'}</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Email"
                type="email"
                autoComplete="off"
                required
                value={email}
                maxLength={254}
                hint="If this email already has an account, it’s given these roles instead."
                onChange={(event) => setEmail(event.target.value)}
              />
              <TextField
                label="Full name (optional)"
                value={fullName}
                maxLength={120}
                onChange={(event) => setFullName(event.target.value)}
              />
            </div>
          )}
          <MembershipRows drafts={drafts} branches={branches} onChange={setDrafts} />
        </div>
        {error && (
          <p role="alert" className="mx-5 mb-4 rounded-[10px] bg-error-tint px-4 py-3 text-[14px] font-[550] text-error sm:mx-6">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-border bg-surface px-5 py-4 sm:px-6">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {isEdit ? 'Save access' : 'Create account'}
          </Button>
        </div>
      </form>
    </AdminCard>
  )
}

// --- One-time password modal ---------------------------------------------------------------------

function PasswordModal({ revealed, onClose }: { revealed: RevealedPassword; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(revealed.value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Modal open onOpenChange={(open) => !open && onClose()} title="Temporary password">
      <div className="px-6 pt-2 pb-6">
        <p className="text-[15px] text-muted">
          Give this to <strong className="text-ink">{revealed.email}</strong>. They set their own password when
          they first sign in on the staff page.
        </p>
        <div className="mt-4 flex items-stretch gap-2">
          <code className="flex-1 rounded-[12px] border border-border bg-surface px-4 py-3 font-mono text-[16px] tracking-wide break-all text-ink">
            {revealed.value}
          </code>
          <Button variant="outline" onClick={() => void copy()} aria-label="Copy password">
            {copied ? <Check className="size-4 text-basil" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <p className="mt-4 rounded-[10px] bg-crust-tint px-4 py-3 text-[13px] font-[550] text-ink">
          Shown once — it can’t be retrieved again. Expires in {revealed.expiresInDays} days; after that, reset the
          password to issue a new one.
        </p>
        <div className="mt-6 flex justify-end border-t border-border pt-4">
          <Button onClick={onClose}>I’ve saved it</Button>
        </div>
      </div>
    </Modal>
  )
}

// --- Page ----------------------------------------------------------------------------------------

type PendingConfirm = { member: AdminStaffMember; kind: 'reset' | 'disable' | 'enable' }

export function StaffPage() {
  const staff = useAdminStaff()
  const branchesQuery = useAccessibleBranches('admin')
  const resetPassword = useResetAdminStaffPassword()
  const setDisabled = useSetAdminStaffDisabled()
  const { toast } = useToast()
  const [editor, setEditor] = useState<AdminStaffMember | 'new' | null>(null)
  const [revealed, setRevealed] = useState<RevealedPassword | null>(null)
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null)

  const branches = useMemo(() => branchesQuery.data ?? [], [branchesQuery.data])
  const confirmPending = resetPassword.isPending || setDisabled.isPending

  async function runConfirm() {
    if (!confirm) return
    const { member, kind } = confirm
    try {
      if (kind === 'reset') {
        const result = await resetPassword.mutateAsync(member.id)
        setRevealed({
          email: member.email,
          value: result.temporaryPassword,
          expiresInDays: result.expiresInDays,
        })
        // Clear the temp password out of the mutation cache now it's in local reveal state.
        resetPassword.reset()
      } else {
        await setDisabled.mutateAsync({ userId: member.id, disabled: kind === 'disable' })
        toast(kind === 'disable' ? 'Account disabled.' : 'Account re-enabled.')
      }
      setConfirm(null)
    } catch (actionError) {
      toast(errorMessage(actionError))
    }
  }

  const confirmCopy = confirm
    ? {
        reset: {
          title: 'Reset this password?',
          confirm: 'Reset password',
          destructive: false,
          body: 'Issues a new temporary password and forces a password change at next sign-in. The current password stops working immediately.',
        },
        disable: {
          title: 'Disable this account?',
          confirm: 'Disable account',
          destructive: true,
          body: 'Blocks sign-in and cuts off their next request across every app. Branch access is kept, so you can re-enable later.',
        },
        enable: {
          title: 'Re-enable this account?',
          confirm: 'Enable account',
          destructive: false,
          body: 'Restores sign-in and their previous branch access takes effect immediately.',
        },
      }[confirm.kind]
    : null

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Access management"
        title="Staff"
        description="Create manager and kitchen accounts, assign the branches they can work, reset passwords, and disable people who’ve left. Promoting to manager can take up to an hour (or a re-login) to unlock this panel for them; branch access and disabling apply immediately."
        action={
          <Button onClick={() => setEditor('new')} disabled={branchesQuery.isPending}>
            <UserPlus className="size-4" aria-hidden />
            New account
          </Button>
        }
      />

      {editor !== null && (
        <StaffEditor
          key={editor === 'new' ? 'new' : editor.id}
          member={editor === 'new' ? null : editor}
          branches={branches}
          onClose={() => setEditor(null)}
          onPasswordIssued={setRevealed}
        />
      )}

      <div className="mt-7">
        {staff.isPending ? (
          <Skeleton className="h-64 w-full rounded-[20px]" />
        ) : staff.isError ? (
          <ErrorState message={errorMessage(staff.error)} onRetry={() => void staff.refetch()} />
        ) : (staff.data?.length ?? 0) === 0 ? (
          <EmptyState
            title="No staff accounts yet"
            body="Add a manager or kitchen account and assign the branches they work."
            action={
              <Button onClick={() => setEditor('new')} disabled={branchesQuery.isPending}>
                Add the first account
              </Button>
            }
          />
        ) : (
          <AdminCard className="divide-y divide-border">
            {staff.data!.map((member) => (
              <div key={member.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-[650] text-ink">{member.fullName ?? member.email}</p>
                    {roleBadge(member)}
                    {member.status === 'disabled' && <Badge variant="neutral">Disabled</Badge>}
                  </div>
                  {member.fullName && <p className="truncate text-[13px] text-muted">{member.email}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {member.memberships.length === 0 ? (
                      <span className="text-[13px] text-muted">No branch access</span>
                    ) : (
                      member.memberships.map((membership) => (
                        <span
                          key={membership.branchId}
                          className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-[12px] font-[550] text-ink"
                        >
                          {membership.branchName}
                          <span className="text-muted">· {membership.role === 'manager' ? 'Manager' : 'Kitchen'}</span>
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditor(member)}>
                    <Users className="size-3.5" aria-hidden />
                    Edit access
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirm({ member, kind: 'reset' })}>
                    <KeyRound className="size-3.5" aria-hidden />
                    Reset password
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirm({ member, kind: member.status === 'disabled' ? 'enable' : 'disable' })}
                  >
                    {member.status === 'disabled' ? 'Enable' : 'Disable'}
                  </Button>
                </div>
              </div>
            ))}
          </AdminCard>
        )}
      </div>

      {confirm && confirmCopy && (
        <ConfirmAction
          open
          title={confirmCopy.title}
          body={confirmCopy.body}
          confirmLabel={confirmCopy.confirm}
          destructive={confirmCopy.destructive}
          pending={confirmPending}
          onOpenChange={(open) => !open && setConfirm(null)}
          onConfirm={() => void runConfirm()}
        />
      )}

      {revealed && <PasswordModal revealed={revealed} onClose={() => setRevealed(null)} />}
    </AdminPage>
  )
}
