/**
 * Live order-status updates. In live mode this connects to the platform's
 * API Gateway WebSocket (`wss://…?token=<access token>`; buyers are
 * auto-subscribed to their own orders on $connect). Messages are lightweight
 * pokes — the caller refetches the authoritative order via REST.
 * In mock mode the mock kitchen's events are relayed through the same
 * interface, so consuming code is identical.
 */
import { config, isMock } from '@/config'

import { mockStore } from './mock/store'
import type { OrderChangedMessage } from './types'

export type OrderEventListener = (message: OrderChangedMessage) => void

interface OrderEventsConnection {
  close: () => void
}

const RECONNECT_BASE_MS = 2000
const RECONNECT_MAX_MS = 30000

export function connectOrderEvents(
  getAccessToken: () => Promise<string | undefined>,
  onMessage: OrderEventListener,
): OrderEventsConnection {
  if (isMock) {
    const unsubscribe = mockStore.subscribe(onMessage)
    return { close: () => void unsubscribe() }
  }

  let socket: WebSocket | null = null
  let closed = false
  let attempt = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined

  async function open() {
    if (closed || !config.wsUrl) return
    const token = await getAccessToken()
    if (!token || closed) return

    socket = new WebSocket(`${config.wsUrl}?token=${encodeURIComponent(token)}`)

    socket.onopen = () => {
      attempt = 0
    }
    socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data as string) as OrderChangedMessage
        if (parsed.type === 'order.placed' || parsed.type === 'order.status_changed') {
          onMessage(parsed)
        }
      } catch {
        // non-JSON keepalive frames are fine to ignore
      }
    }
    socket.onclose = () => {
      if (closed) return
      const backoff = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS)
      attempt += 1
      reconnectTimer = setTimeout(() => void open(), backoff)
    }
  }

  void open()

  return {
    close: () => {
      closed = true
      clearTimeout(reconnectTimer)
      socket?.close()
    },
  }
}
