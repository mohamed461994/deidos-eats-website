import { QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { queryClient } from '@/api/query-client'

import { AuthProvider } from '@/auth/context'
import { CartProvider } from '@/cart/context'
import { CartDrawer } from '@/components/cart-drawer'
import { CartRestoreBanner } from '@/components/cart-restore-banner'
import { MobileCartBar } from '@/components/layout/cart-bar'
import { Footer } from '@/components/layout/footer'
import { Header } from '@/components/layout/header'
import { ToastProvider } from '@/components/ui/toast'
import { config } from '@/config'
import { AccountPage } from '@/pages/account'
import { SignInPage, SignUpPage } from '@/pages/auth'
import { CheckoutPage } from '@/pages/checkout'
import { DiscoveryPage } from '@/pages/discovery'
import { HomePage } from '@/pages/home'
import { LocationsPage } from '@/pages/locations'
import { MenuPage } from '@/pages/menu'
import { NotFoundPage } from '@/pages/not-found'
import { OrdersPage } from '@/pages/orders'
import { OrderTrackingPage } from '@/pages/order-tracking'
import { RestaurantHomePage } from '@/pages/restaurant'
import { RestaurantLayout } from '@/pages/restaurant-layout'
import { ColorLab } from '@/theme/color-lab' // TEMP: brand-green picker — delete this line + the file later

const AdminApp = lazy(() => import('@/admin/app'))
const StaffSignInPage = lazy(() => import('@/admin/staff-sign-in'))

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])
  return null
}

function LazyRouteFallback() {
  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-4">
      <p role="status" className="text-[15px] text-muted">Loading secure sign-in…</p>
    </main>
  )
}

function BuyerApp() {
  return (
    <CartProvider>
      <div className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-basil focus:px-4 focus:py-2 focus:text-on-basil"
        >
          Skip to content
        </a>
        <Header />
        <CartRestoreBanner />
        <div id="main" className="flex-1">
          <Routes>
            {/* Home — the branch-first marketplace front door. */}
            <Route path="/" element={<HomePage />} />

            {/* The retained restaurant-card page (not linked from home). */}
            <Route path="/restaurants" element={<DiscoveryPage />} />

            {/* A restaurant's own space; branch lives IN the menu URL. */}
            <Route path="/r/:slug" element={<RestaurantLayout />}>
              <Route index element={<RestaurantHomePage />} />
              <Route path="b/:branchId/menu" element={<MenuPage />} />
              <Route path="locations" element={<LocationsPage />} />
            </Route>

            {/* Global platform routes — identity derived from cart/order. */}
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/orders/:orderId" element={<OrderTrackingPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/signup" element={<SignUpPage />} />

            {/* Legacy single-restaurant paths → discovery (no restaurant context). */}
            <Route path="/menu" element={<Navigate to="/" replace />} />
            <Route path="/locations" element={<Navigate to="/" replace />} />

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
        <Footer />
      </div>
      <CartDrawer />
      <MobileCartBar />
    </CartProvider>
  )
}

function AppRoutes() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route
          path={config.staffSignInPath}
          element={
            <Suspense fallback={<LazyRouteFallback />}>
              <StaffSignInPage />
            </Suspense>
          }
        />
        <Route
          path="/admin/*"
          element={
            <Suspense fallback={<LazyRouteFallback />}>
              <AdminApp />
            </Suspense>
          }
        />
        <Route path="*" element={<BuyerApp />} />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <AppRoutes />
            <ColorLab /> {/* TEMP: brand-green picker — delete later */}
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
