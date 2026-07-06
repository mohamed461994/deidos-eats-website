import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { useAuth } from '@/auth/context'
import { AuthFlowError } from '@/auth/provider'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/field'
import { isMock } from '@/config'

function authErrorMessage(error: unknown): string {
  if (error instanceof AuthFlowError) return error.message
  return 'Something went wrong. Try again.'
}

function MockHint() {
  if (!isMock) return null
  return (
    <p className="rounded-[10px] bg-crust-tint px-4 py-3 text-[13px] text-ink">
      <strong>Demo mode:</strong> any email works; passwords just need 12+ characters. The
      confirmation code is any 6 digits.
    </p>
  )
}

export function SignInPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') ?? '/menu'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
      navigate(next, { replace: true })
    } catch (err) {
      if (err instanceof AuthFlowError && err.code === 'not_confirmed') {
        navigate(`/signup?confirm=${encodeURIComponent(email.trim())}&next=${encodeURIComponent(next)}`)
        return
      }
      setError(authErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-14 sm:px-6">
      <h1 className="display text-3xl">Welcome back</h1>
      <p className="mt-2 text-muted">Sign in to order and track it live.</p>
      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4" noValidate>
        <MockHint />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p role="alert" className="rounded-[10px] bg-error-tint px-4 py-3 text-[15px] font-[550] text-error">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" loading={pending} disabled={!email || !password}>
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-[15px] text-muted">
        First time here?{' '}
        <Link to={`/signup?next=${encodeURIComponent(next)}`} className="font-[650] text-basil underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </main>
  )
}

export function SignUpPage() {
  const { signUp, confirmSignUp } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') ?? '/menu'
  const confirmEmailParam = params.get('confirm')

  const [step, setStep] = useState<'details' | 'confirm'>(confirmEmailParam ? 'confirm' : 'details')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState(confirmEmailParam ?? '')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSignUp(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const result = await signUp(email.trim(), password, fullName.trim())
      if (result.needsConfirmation) {
        setStep('confirm')
      } else {
        navigate(next, { replace: true })
      }
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  async function handleConfirm(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await confirmSignUp(email.trim(), code.trim())
      navigate(next, { replace: true })
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-14 sm:px-6">
      {step === 'details' ? (
        <>
          <h1 className="display text-3xl">Join the mischief</h1>
          <p className="mt-2 text-muted">
            One account for ordering, live tracking and your history.
          </p>
          <form onSubmit={handleSignUp} className="mt-8 flex flex-col gap-4" noValidate>
            <MockHint />
            <TextField
              label="Full name"
              autoComplete="name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            <TextField
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <TextField
              label="Password"
              type="password"
              autoComplete="new-password"
              required
              hint="At least 12 characters, with upper & lower case, a number and a symbol."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && (
              <p role="alert" className="rounded-[10px] bg-error-tint px-4 py-3 text-[15px] font-[550] text-error">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" loading={pending} disabled={!email || !password || !fullName}>
              Create account
            </Button>
          </form>
          <p className="mt-6 text-[15px] text-muted">
            Already ordered with us?{' '}
            <Link to={`/signin?next=${encodeURIComponent(next)}`} className="font-[650] text-basil underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </>
      ) : (
        <>
          <h1 className="display text-3xl">Check your email</h1>
          <p className="mt-2 text-muted">
            We sent a 6-digit code to <strong className="text-ink">{email}</strong>. Enter it to
            finish signing up.
          </p>
          <form onSubmit={handleConfirm} className="mt-8 flex flex-col gap-4" noValidate>
            <MockHint />
            <TextField
              label="Confirmation code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            {error && (
              <p role="alert" className="rounded-[10px] bg-error-tint px-4 py-3 text-[15px] font-[550] text-error">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" loading={pending} disabled={code.length !== 6}>
              Confirm and sign in
            </Button>
          </form>
        </>
      )}
    </main>
  )
}
