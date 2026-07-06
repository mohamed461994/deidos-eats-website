import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'

import { AuthProvider } from '@/auth/context'
import { CartProvider } from '@/cart/context'
import { CartDrawer } from '@/components/cart-drawer'
import { MobileCartBar } from '@/components/layout/cart-bar'
import { Footer } from '@/components/layout/footer'
import { Header } from '@/components/layout/header'
import { ToastProvider } from '@/components/ui/toast'
import { AccountPage } from '@/pages/account'
import { SignInPage, SignUpPage } from '@/pages/auth'
import { CheckoutPage } from '@/pages/checkout'
import { HomePage } from '@/pages/home'
import { LocationsPage } from '@/pages/locations'
import { MenuPage } from '@/pages/menu'
import { NotFoundPage } from '@/pages/not-found'
import { OrdersPage } from '@/pages/orders'
import { OrderTrackingPage } from '@/pages/order-tracking'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])
  return null
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <CartProvider>
            <ToastProvider>
              <ScrollToTop />
              <div className="flex min-h-dvh flex-col">
                <a
                  href="#main"
                  className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-basil focus:px-4 focus:py-2 focus:text-on-basil"
                >
                  Skip to content
                </a>
                <Header />
                <div id="main" className="flex-1">
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/menu" element={<MenuPage />} />
                    <Route path="/locations" element={<LocationsPage />} />
                    <Route path="/checkout" element={<CheckoutPage />} />
                    <Route path="/orders" element={<OrdersPage />} />
                    <Route path="/orders/:orderId" element={<OrderTrackingPage />} />
                    <Route path="/account" element={<AccountPage />} />
                    <Route path="/signin" element={<SignInPage />} />
                    <Route path="/signup" element={<SignUpPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </div>
                <Footer />
              </div>
              <CartDrawer />
              <MobileCartBar />
            </ToastProvider>
          </CartProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
