import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { useAuth } from '@/auth/context'
import { cooldownRemaining } from '@/auth/cooldown'
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
      <strong>Demo mode:</strong> sign up with any email and a 12+ character password; the
      confirmation code is any 6 digits. Sign-in works for accounts created in this browser.
    </p>
  )
}

export function SignInPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') ?? '/'
  const justConfirmed = params.get('confirmed') === '1'

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
        {justConfirmed && !error && (
          <p role="status" className="rounded-[10px] bg-basil-tint px-4 py-3 text-[15px] font-[550] text-basil">
            Email confirmed — sign in to continue.
          </p>
        )}
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
  const { signIn, signUp, confirmSignUp, resendConfirmationCode } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') ?? '/'
  const confirmEmailParam = params.get('confirm')

  const [step, setStep] = useState<'details' | 'confirm'>(confirmEmailParam ? 'confirm' : 'details')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState(confirmEmailParam ?? '')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // "Resend code" is throttled client-side: after a send we disable the button
  // for RESEND_COOLDOWN_SECONDS and count down. `now` re-renders the countdown.
  const [resending, setResending] = useState(false)
  const [resendNotice, setResendNotice] = useState<string | null>(null)
  const [resendStartedAt, setResendStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const resendRemaining = cooldownRemaining(resendStartedAt, now)

  useEffect(() => {
    if (resendStartedAt === null) return
    const id = setInterval(() => {
      setNow(Date.now())
      if (cooldownRemaining(resendStartedAt, Date.now()) <= 0) clearInterval(id)
    }, 1000)
    return () => clearInterval(id)
  }, [resendStartedAt])

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
    const confirmEmail = email.trim()
    const signInTo = `/signin?next=${encodeURIComponent(next)}&confirmed=1`
    try {
      await confirmSignUp(confirmEmail, code.trim())
    } catch (err) {
      setError(authErrorMessage(err))
      setPending(false)
      return
    }
    // Confirming does not create a session. In the fresh-signup flow the password
    // is still in memory, so sign in immediately. On the `?confirm=` re-entry path
    // (from the sign-in page) we don't have it — send them to sign in.
    // SECURITY: the password only ever lives in this component's state, never in
    // the URL, router state, or storage.
    if (!password) {
      navigate(signInTo, { replace: true })
      setPending(false)
      return
    }
    try {
      await signIn(confirmEmail, password)
      navigate(next, { replace: true })
    } catch {
      // The account is already confirmed; if this sign-in fails (e.g. transient),
      // don't trap the user on a spent code — hand off to the sign-in page.
      navigate(signInTo, { replace: true })
    } finally {
      setPending(false)
    }
  }

  async function handleResend() {
    if (resendRemaining > 0 || resending) return
    setResending(true)
    setError(null)
    setResendNotice(null)
    try {
      await resendConfirmationCode(email.trim())
      setResendStartedAt(Date.now())
      setNow(Date.now())
      setResendNotice('A new code is on its way — check your inbox.')
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setResending(false)
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
            <div className="flex items-center gap-3 text-[13px]">
              <button
                type="button"
                onClick={handleResend}
                disabled={resendRemaining > 0 || resending}
                className="font-[650] text-basil underline-offset-4 hover:underline disabled:text-muted disabled:no-underline"
              >
                {resendRemaining > 0 ? `Resend code in ${resendRemaining}s` : 'Resend code'}
              </button>
              {resendNotice && <span role="status" className="text-muted">{resendNotice}</span>}
            </div>
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
