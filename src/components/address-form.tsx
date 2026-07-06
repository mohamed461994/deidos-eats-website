import { useState, type FormEvent } from 'react'

import { api, errorMessage } from '@/api'
import type { Address } from '@/api/types'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/field'
import { isValidEircode, normalizeEircode } from '@/lib/eircode'

interface AddressFormProps {
  onSaved: (address: Address) => void
  onCancel?: () => void
}

/**
 * Saved-address create form. The contract requires a valid Eircode; there is
 * no buyer-facing autocomplete endpoint yet (staff-only HERE proxy), so entry
 * is manual — see implementation.md → backend gaps.
 */
export function AddressForm({ onSaved, onCancel }: AddressFormProps) {
  const [label, setLabel] = useState('')
  const [line1, setLine1] = useState('')
  const [line2, setLine2] = useState('')
  const [town, setTown] = useState('')
  const [county, setCounty] = useState('')
  const [eircode, setEircode] = useState('')
  const [eircodeError, setEircodeError] = useState<string | undefined>()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!isValidEircode(eircode)) {
      setEircodeError('That doesn’t look like an Eircode — e.g. D02 AF30.')
      return
    }
    setEircodeError(undefined)
    setPending(true)
    setError(null)
    try {
      const address = await api.createMyAddress({
        label: label.trim() || undefined,
        line1: line1.trim(),
        line2: line2.trim() || undefined,
        town: town.trim(),
        county: county.trim(),
        eircode: normalizeEircode(eircode),
        isDefault: false,
      })
      onSaved(address)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <TextField
        label="Label (optional)"
        placeholder="Home, work…"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        maxLength={60}
      />
      <TextField
        label="Address line 1"
        autoComplete="address-line1"
        required
        value={line1}
        onChange={(e) => setLine1(e.target.value)}
        maxLength={120}
      />
      <TextField
        label="Address line 2 (optional)"
        autoComplete="address-line2"
        value={line2}
        onChange={(e) => setLine2(e.target.value)}
        maxLength={120}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Town"
          autoComplete="address-level2"
          required
          value={town}
          onChange={(e) => setTown(e.target.value)}
          maxLength={80}
        />
        <TextField
          label="County"
          required
          value={county}
          onChange={(e) => setCounty(e.target.value)}
          maxLength={80}
        />
      </div>
      <TextField
        label="Eircode"
        autoComplete="postal-code"
        required
        placeholder="D02 AF30"
        value={eircode}
        onChange={(e) => setEircode(e.target.value)}
        error={eircodeError}
        hint="We use this to work out the delivery fee."
      />
      {error && (
        <p role="alert" className="rounded-[10px] bg-error-tint px-4 py-3 text-[15px] font-[550] text-error">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        {onCancel && (
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          className="flex-1"
          loading={pending}
          disabled={!line1 || !town || !county || !eircode}
        >
          Save address
        </Button>
      </div>
    </form>
  )
}
