import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from 'react'

import type { MenuItem, ModifierOption } from '@/api/types'

import {
  buildLine,
  cartItemCount,
  cartReducer,
  cartSubtotalCents,
  emptyCart,
  toCartLineInputs,
  type CartState,
} from './cart'

const STORAGE_KEY = 'puca-cart-v1'

interface AddResult {
  /** 'conflict' → cart holds another branch's items; confirm before replacing. */
  outcome: 'added' | 'conflict'
}

interface CartContextValue {
  cart: CartState
  itemCount: number
  subtotalCents: number
  lineInputs: ReturnType<typeof toCartLineInputs>
  isOpen: boolean
  openCart: () => void
  closeCart: () => void
  addItem: (args: {
    branchId: string
    branchName: string
    item: MenuItem
    options: ModifierOption[]
    quantity: number
    force?: boolean
  }) => AddResult
  setQuantity: (key: string, quantity: number) => void
  removeLine: (key: string) => void
  clearCart: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

function loadCart(): CartState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as CartState
  } catch {
    // fall through to empty
  }
  return emptyCart
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, dispatch] = useReducer(cartReducer, undefined, loadCart)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart))
  }, [cart])

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      itemCount: cartItemCount(cart),
      subtotalCents: cartSubtotalCents(cart),
      lineInputs: toCartLineInputs(cart),
      isOpen,
      openCart: () => setIsOpen(true),
      closeCart: () => setIsOpen(false),
      addItem: ({ branchId, branchName, item, options, quantity, force = false }) => {
        const differentBranch =
          cart.branchId !== null && cart.branchId !== branchId && cart.lines.length > 0
        if (differentBranch && !force) return { outcome: 'conflict' }
        dispatch({ type: 'add', branchId, branchName, line: buildLine(item, options, quantity) })
        return { outcome: 'added' }
      },
      setQuantity: (key, quantity) => dispatch({ type: 'setQuantity', key, quantity }),
      removeLine: (key) => dispatch({ type: 'remove', key }),
      clearCart: () => dispatch({ type: 'clear' }),
    }),
    [cart, isOpen],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCart(): CartContextValue {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart must be used inside <CartProvider>')
  return context
}
