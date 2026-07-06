import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import { api, errorMessage } from '@/api'
import { queryKeys, useAddresses, useMe } from '@/api/queries'
import type { User } from '@/api/types'
import { useAuth } from '@/auth/context'
import { AddressForm } from '@/components/address-form'
import { ErrorState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'

function ProfileForm({ user }: { user: User }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [fullName, setFullName] = useState(user.fullName ?? '')
  const [phone, setPhone] = useState(user.phone ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await api.updateMe({
        fullName: fullName.trim() || undefined,
        phone: phone.trim() || undefined,
      })
      queryClient.setQueryData(queryKeys.me, updated)
      toast('Profile saved')
    } catch (err) {
      setSaveError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-4">
      <TextField
        label="Full name"
        autoComplete="name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        maxLength={120}
      />
      <TextField
        label="Phone"
        type="tel"
        autoComplete="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        maxLength={20}
        hint="The kitchen calls this number if something comes up with your order."
      />
      {saveError && (
        <p role="alert" className="rounded-[10px] bg-error-tint px-4 py-3 text-[15px] font-[550] text-error">
          {saveError}
        </p>
      )}
      <Button type="submit" className="self-start" loading={saving}>
        Save changes
      </Button>
    </form>
  )
}

export function AccountPage() {
  const { status, signOut, email } = useAuth()
  const meQuery = useMe()
  const addressesQuery = useAddresses()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [addingAddress, setAddingAddress] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  if (status === 'signedOut') return <Navigate to="/signin?next=/account" replace />

  async function handleDeleteAddress(addressId: string) {
    setDeletingId(addressId)
    try {
      await api.deleteMyAddress(addressId)
      await addressesQuery.refetch()
      toast('Address removed')
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 sm:px-6">
      <header className="pt-10 pb-6">
        <h1 className="display text-[clamp(2rem,4.5vw,3rem)]">Your account</h1>
        {email && <p className="mt-2 text-muted">{email}</p>}
      </header>

      <div className="flex flex-col gap-10">
        {/* Profile */}
        <section aria-labelledby="profile-heading">
          <h2 id="profile-heading" className="display mb-4 text-xl">
            Profile
          </h2>
          {meQuery.isError ? (
            <ErrorState message={errorMessage(meQuery.error)} onRetry={() => void meQuery.refetch()} />
          ) : meQuery.isPending || !meQuery.data ? (
            <Skeleton className="h-36 w-full" />
          ) : (
            <ProfileForm key={meQuery.data.id} user={meQuery.data} />
          )}
        </section>

        {/* Addresses */}
        <section aria-labelledby="addresses-heading">
          <h2 id="addresses-heading" className="display mb-4 text-xl">
            Delivery addresses
          </h2>
          {addressesQuery.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="flex flex-col gap-3">
              {(addressesQuery.data ?? []).map((address) => (
                <div
                  key={address.id}
                  className="flex items-center justify-between gap-3 rounded-[16px] border border-border p-4"
                >
                  <div>
                    <p className="font-[650]">
                      {address.label ?? address.line1}
                      {address.isDefault && (
                        <span className="ml-2 text-[13px] font-[450] text-muted">Default</span>
                      )}
                    </p>
                    <p className="text-[15px] text-muted">
                      {address.line1}, {address.town}, {address.eircode}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={deletingId === address.id}
                    onClick={() => void handleDeleteAddress(address.id)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              {addingAddress ? (
                <div className="rounded-[16px] border border-border p-4">
                  <AddressForm
                    onSaved={() => {
                      setAddingAddress(false)
                      void addressesQuery.refetch()
                      toast('Address saved')
                    }}
                    onCancel={() => setAddingAddress(false)}
                  />
                </div>
              ) : (
                <Button variant="outline" className="self-start" onClick={() => setAddingAddress(true)}>
                  Add address
                </Button>
              )}
            </div>
          )}
        </section>

        {/* Session */}
        <section>
          <Button
            variant="outline"
            onClick={() => {
              void signOut().then(() => navigate('/'))
            }}
          >
            Sign out
          </Button>
        </section>
      </div>
    </main>
  )
}
