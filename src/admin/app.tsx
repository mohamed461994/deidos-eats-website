import {
  BadgePercent,
  Building2,
  ChefHat,
  FileText,
  Flag,
  Image,
  LogOut,
  ShieldX,
  type LucideIcon,
} from 'lucide-react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '@/auth/context'
import { Button } from '@/components/ui/button'
import { config } from '@/config'
import { PLATFORM_NAME } from '@/lib/brand'
import { paths } from '@/lib/routes'
import { cn } from '@/lib/utils'

import { DiscountsPage } from './discounts'

interface PanelSection {
  label: string
  path: string
  icon: LucideIcon
  manager: boolean
}

const SECTIONS: PanelSection[] = [
  { label: 'Discounts', path: '/admin/discounts', icon: BadgePercent, manager: true },
  { label: 'Banners', path: '/admin/banners', icon: Image, manager: false },
  { label: 'From the oven', path: '/admin/oven', icon: ChefHat, manager: false },
  { label: 'Text & links', path: '/admin/content', icon: FileText, manager: false },
  { label: 'Restaurants', path: '/admin/restaurants', icon: Building2, manager: false },
  { label: 'Branches', path: '/admin/branches', icon: Flag, manager: false },
]

function LoadingGate() {
  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-4">
      <p role="status" className="text-[15px] text-muted">Verifying staff session…</p>
    </main>
  )
}

function AccessDenied() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  async function leave() {
    await signOut()
    navigate(config.staffSignInPath, { replace: true })
  }
  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-4">
      <div className="max-w-md rounded-[20px] border border-border bg-bg p-7 text-center shadow-raised">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-error-tint text-error">
          <ShieldX className="size-6" aria-hidden />
        </div>
        <h1 className="mt-4 text-xl font-[700]">No staff-panel access</h1>
        <p className="mt-2 text-[15px] text-muted">
          This signed-in account is not a platform administrator or restaurant manager.
        </p>
        <Button className="mt-6" onClick={() => void leave()}>
          Sign out and use a staff account
        </Button>
      </div>
    </main>
  )
}

function StubPage({ title }: { title: string }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-[700] tracking-[-0.02em]">{title}</h1>
      <div className="mt-6 rounded-[16px] border border-border bg-bg p-6">
        <p className="font-[650]">This section is ready in the shell.</p>
        <p className="mt-1 max-w-[60ch] text-[15px] text-muted">
          Its content tools are intentionally deferred to Session 7.
        </p>
      </div>
    </main>
  )
}

function PanelShell() {
  const { email, role, signOut } = useAuth()
  const navigate = useNavigate()
  const sections = SECTIONS.filter((section) => role === 'admin' || section.manager)

  async function leave() {
    await signOut()
    navigate(config.staffSignInPath, { replace: true })
  }

  return (
    <div className="min-h-dvh bg-surface lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="border-b border-border bg-bg lg:sticky lg:top-0 lg:h-dvh lg:border-r lg:border-b-0">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-3 px-4 py-4 lg:block lg:px-5 lg:py-6">
            <div>
              <p className="text-lg font-[700] tracking-[-0.02em] text-basil-deep">{PLATFORM_NAME}</p>
              <p className="text-[13px] text-muted">Staff operations</p>
            </div>
            <span className="rounded-full bg-basil-tint px-2.5 py-1 text-[12px] font-[650] text-basil-deep lg:mt-3 lg:inline-flex">
              {role === 'admin' ? 'Administrator' : 'Restaurant manager'}
            </span>
          </div>

          <nav aria-label="Staff panel" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-0">
            {sections.map((section) => {
              const Icon = section.icon
              return (
                <NavLink
                  key={section.path}
                  to={section.path}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-11 shrink-0 items-center gap-3 rounded-[10px] px-3 py-2 text-[14px] font-[550] transition-colors',
                      isActive
                        ? 'bg-basil-tint text-basil-deep'
                        : 'text-ink hover:bg-surface',
                    )
                  }
                >
                  <Icon className="size-4.5" aria-hidden />
                  {section.label}
                </NavLink>
              )
            })}
          </nav>

          <div className="mt-auto hidden border-t border-border p-4 lg:block">
            <p className="truncate text-[13px] font-[550] text-ink">{email}</p>
            <button
              type="button"
              onClick={() => void leave()}
              className="mt-2 flex min-h-10 w-full items-center gap-2 rounded-[10px] px-2 text-[14px] text-muted transition-colors hover:bg-surface hover:text-ink"
            >
              <LogOut className="size-4" aria-hidden />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <div className="flex items-center justify-between border-b border-border bg-bg px-4 py-3 lg:hidden">
          <p className="max-w-[65vw] truncate text-[13px] text-muted">{email}</p>
          <Button size="sm" variant="ghost" onClick={() => void leave()}>
            <LogOut className="size-4" aria-hidden />
            Sign out
          </Button>
        </div>
        <Routes>
          <Route index element={<Navigate to={paths.adminDiscounts()} replace />} />
          <Route path="discounts" element={<DiscountsPage />} />
          {role === 'admin' && (
            <>
              <Route path="banners" element={<StubPage title="Banners" />} />
              <Route path="oven" element={<StubPage title="From the oven" />} />
              <Route path="content" element={<StubPage title="Text & links" />} />
              <Route path="restaurants" element={<StubPage title="Restaurants" />} />
              <Route path="branches" element={<StubPage title="Branches" />} />
            </>
          )}
          <Route path="*" element={<Navigate to={paths.adminDiscounts()} replace />} />
        </Routes>
      </div>
    </div>
  )
}

export default function AdminApp() {
  const { status, role, staffVerified } = useAuth()
  const location = useLocation()
  if (status === 'restoring') return <LoadingGate />
  if (status === 'signedOut' || !staffVerified) {
    const next = `${location.pathname}${location.search}`
    return (
      <Navigate
        to={`${config.staffSignInPath}?next=${encodeURIComponent(next)}`}
        replace
      />
    )
  }
  if (role !== 'admin' && role !== 'restaurant_manager') return <AccessDenied />
  return <PanelShell />
}
