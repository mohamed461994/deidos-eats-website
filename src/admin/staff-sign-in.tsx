import { CheckCircle2, KeyRound, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { toDataURL } from 'qrcode'

import { useAuth } from '@/auth/context'
import { AuthFlowError } from '@/auth/provider'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/field'
import { PLATFORM_NAME } from '@/lib/brand'
import { paths } from '@/lib/routes'

function safeMessage(error: unknown): string {
  if (error instanceof AuthFlowError) return error.message
  return 'Staff sign-in could not be completed. Try again.'
}

function safeAdminNext(requested: string | null): string {
  if (!requested || !requested.startsWith('/') || requested.startsWith('//')) return paths.admin()
  try {
    const parsed = new URL(requested, window.location.origin)
    if (
      parsed.origin !== window.location.origin ||
      (parsed.pathname !== '/admin' && !parsed.pathname.startsWith('/admin/'))
    ) {
      return paths.admin()
    }
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return paths.admin()
  }
}

function useNoIndex() {
  useEffect(() => {
    const existing = document.querySelector<HTMLMetaElement>('meta[name="robots"]')
    const previous = existing?.content
    const meta = existing ?? document.createElement('meta')
    if (!existing) {
      meta.name = 'robots'
      document.head.append(meta)
    }
    meta.content = 'noindex, nofollow, noarchive'
    return () => {
      if (!existing) meta.remove()
      else meta.content = previous ?? ''
    }
  }, [])
}

export default function StaffSignInPage() {
  useNoIndex()
  const {
    status,
    role,
    staffVerified,
    staffMfaStep,
    staffEmail,
    beginStaffSignIn,
    completeStaffNewPassword,
    confirmStaffMfa,
    cancelStaffSignIn,
  } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeAdminNext(params.get('next'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<{ uri: string; url: string } | null>(null)

  const enrollmentUri = useMemo(() => {
    if (staffMfaStep?.kind !== 'totpEnrollment' || !staffEmail) return null
    const issuer = `${PLATFORM_NAME} Staff`
    const label = `${issuer}:${staffEmail}`
    const query = new URLSearchParams({
      secret: staffMfaStep.secret,
      issuer,
      algorithm: 'SHA1',
      digits: '6',
      period: '30',
    })
    return `otpauth://totp/${encodeURIComponent(label)}?${query.toString()}`
  }, [staffEmail, staffMfaStep])

  useEffect(() => {
    let cancelled = false
    if (!enrollmentUri) return
    void toDataURL(enrollmentUri, { width: 240, margin: 2, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) setQrCode({ uri: enrollmentUri, url })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [enrollmentUri])

  if (
    status === 'signedIn' &&
    staffVerified &&
    (role === 'admin' || role === 'restaurant_manager')
  ) {
    return <Navigate to={next} replace />
  }

  async function handleCredentials(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await beginStaffSignIn(email.trim(), password)
      setPassword('')
    } catch (signInError) {
      setError(safeMessage(signInError))
    } finally {
      setPending(false)
    }
  }

  async function handleNewPassword(event: FormEvent) {
    event.preventDefault()
    if (newPassword !== confirmPassword) {
      setError('The two passwords don’t match.')
      return
    }
    setPending(true)
    setError(null)
    try {
      await completeStaffNewPassword(newPassword)
      // The step advances (TOTP enrollment, or the ready screen for kitchen staff); the render
      // follows staffMfaStep. Clear the entered secrets from component state either way.
      setNewPassword('')
      setConfirmPassword('')
    } catch (passwordError) {
      setError(safeMessage(passwordError))
    } finally {
      setPending(false)
    }
  }

  async function handleTotp(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await confirmStaffMfa(code)
      navigate(next, { replace: true })
    } catch (mfaError) {
      setError(safeMessage(mfaError))
    } finally {
      setPending(false)
    }
  }

  async function restart() {
    await cancelStaffSignIn()
    setCode('')
    setNewPassword('')
    setConfirmPassword('')
    setError(null)
  }

  const enrollment = staffMfaStep?.kind === 'totpEnrollment' ? staffMfaStep : null
  const step = staffMfaStep?.kind ?? 'credentials'

  return (
    <main className="min-h-dvh bg-surface px-4 py-8 sm:grid sm:place-items-center sm:px-6">
      <div className="mx-auto grid w-full max-w-4xl overflow-hidden rounded-[24px] border border-border bg-bg shadow-floating md:grid-cols-[0.85fr_1.15fr]">
        <section className="flex flex-col justify-between bg-basil-deep p-7 text-paper sm:p-10">
          <div>
            <div className="flex size-12 items-center justify-center rounded-[14px] bg-paper/10">
              <ShieldCheck className="size-6" aria-hidden />
            </div>
            <p className="mt-8 text-[15px] font-[650]">{PLATFORM_NAME}</p>
            <h1 className="mt-2 max-w-[12ch] text-3xl font-[700] leading-tight tracking-[-0.02em]">
              Staff operations
            </h1>
            <p className="mt-4 max-w-[34ch] text-[15px] text-paper-muted">
              Restricted access for platform administrators and restaurant managers.
            </p>
          </div>
          <p className="mt-12 text-[13px] text-paper-muted">
            Access is protected by Cognito, an authenticator code, and server-side permissions.
          </p>
        </section>

        <section className="p-6 sm:p-10" aria-labelledby="staff-sign-in-heading">
          {step === 'credentials' ? (
            <>
              <div className="flex items-center gap-3">
                <KeyRound className="size-5 text-basil" aria-hidden />
                <h2 id="staff-sign-in-heading" className="text-2xl font-[700] tracking-[-0.02em]">
                  Sign in securely
                </h2>
              </div>
              <p className="mt-2 max-w-[52ch] text-[15px] text-muted">
                Use the staff account assigned to you. Buyer accounts cannot enter this panel.
              </p>
              <form onSubmit={handleCredentials} className="mt-7 flex flex-col gap-4" noValidate>
                <TextField
                  label="Staff email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <TextField
                  label="Password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                {error && (
                  <p role="alert" className="rounded-[10px] bg-error-tint px-4 py-3 text-[15px] font-[550] text-error">
                    {error}
                  </p>
                )}
                <Button type="submit" size="lg" loading={pending} disabled={!email || !password}>
                  Continue
                </Button>
              </form>
            </>
          ) : step === 'newPasswordRequired' ? (
            <>
              <div className="flex items-center gap-3">
                <KeyRound className="size-5 text-basil" aria-hidden />
                <h2 id="staff-sign-in-heading" className="text-2xl font-[700] tracking-[-0.02em]">
                  Set your password
                </h2>
              </div>
              <p className="mt-2 max-w-[52ch] text-[15px] text-muted">
                This account was created with a temporary password. Choose your own to activate it.
              </p>
              <form onSubmit={handleNewPassword} className="mt-7 flex flex-col gap-4" noValidate>
                <TextField
                  label="New password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
                <TextField
                  label="Confirm new password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
                <p className="text-[13px] text-muted">
                  At least 12 characters, with an uppercase letter, a lowercase letter, a number, and a symbol.
                </p>
                {error && (
                  <p role="alert" className="rounded-[10px] bg-error-tint px-4 py-3 text-[15px] font-[550] text-error">
                    {error}
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="submit"
                    size="lg"
                    loading={pending}
                    disabled={newPassword.length < 12 || confirmPassword.length < 12}
                  >
                    Set password and continue
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => void restart()} disabled={pending}>
                    Use another account
                  </Button>
                </div>
              </form>
            </>
          ) : step === 'staffReady' ? (
            <div className="flex flex-col items-start">
              <div className="grid size-12 place-items-center rounded-full bg-basil-tint text-basil-deep">
                <CheckCircle2 className="size-6" aria-hidden />
              </div>
              <h2 id="staff-sign-in-heading" className="mt-5 text-2xl font-[700] tracking-[-0.02em]">
                Your account is ready
              </h2>
              <p className="mt-2 max-w-[52ch] text-[15px] text-muted">
                Your password is set. Kitchen accounts work on the restaurant dashboard or the Deidos
                Orderpad — sign in there with your new password. This panel is for administrators and
                managers.
              </p>
              <Button className="mt-7" variant="ghost" onClick={() => void restart()}>
                Back to sign in
              </Button>
            </div>
          ) : (
            <>
              <h2 id="staff-sign-in-heading" className="text-2xl font-[700] tracking-[-0.02em]">
                {enrollment ? 'Set up your authenticator' : 'Enter your authenticator code'}
              </h2>
              <p className="mt-2 max-w-[58ch] text-[15px] text-muted">
                {enrollment
                  ? 'Enrollment must finish before the staff panel can open.'
                  : 'Open your authenticator app and enter the current 6-digit code.'}
              </p>

              {enrollment && (
                <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center">
                  <div className="grid min-h-56 min-w-56 place-items-center rounded-[16px] border border-border bg-bg p-2 shadow-raised">
                    {qrCode?.uri === enrollmentUri ? (
                      <img
                        src={qrCode.url}
                        alt="QR code for authenticator enrollment"
                        className="size-56"
                      />
                    ) : (
                      <span className="text-sm text-muted">Preparing QR code…</span>
                    )}
                  </div>
                  <ol className="max-w-[28ch] list-decimal space-y-2 pl-5 text-[15px] text-ink">
                    <li>Open your authenticator app.</li>
                    <li>Scan the QR code.</li>
                    <li>Enter the 6-digit code below.</li>
                  </ol>
                </div>
              )}

              {enrollment && (
                <details className="mt-4 rounded-[10px] bg-surface px-4 py-3 text-[13px]">
                  <summary className="cursor-pointer font-[650]">Can’t scan the QR code?</summary>
                  <p className="mt-2 text-muted">Enter this setup key manually:</p>
                  <code className="mt-1 block break-all font-mono text-ink">
                    {enrollment.secret.match(/.{1,4}/g)?.join(' ') ?? enrollment.secret}
                  </code>
                </details>
              )}

              <form onSubmit={handleTotp} className="mt-6 flex flex-col gap-4" noValidate>
                <TextField
                  label="6-digit authenticator code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                />
                {error && (
                  <p role="alert" className="rounded-[10px] bg-error-tint px-4 py-3 text-[15px] font-[550] text-error">
                    {error}
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  <Button type="submit" loading={pending} disabled={code.length !== 6}>
                    {enrollment ? 'Confirm enrollment' : 'Verify and open panel'}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => void restart()} disabled={pending}>
                    Use another account
                  </Button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  )
}
