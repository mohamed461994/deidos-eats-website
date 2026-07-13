import { config } from '@/config'

import { ApiError } from './errors'
import type { ApiErrorBody } from './types'

type TokenProvider = () => Promise<string | undefined>

/** Set once by the auth layer; live requests attach the Cognito access token. */
let getAccessToken: TokenProvider = async () => undefined

export function setAccessTokenProvider(provider: TokenProvider) {
  getAccessToken = provider
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  /** Attach the bearer token (default true; public browse endpoints pass false). */
  auth?: boolean
  headers?: Record<string, string>
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, headers = {} } = options

  const requestHeaders: Record<string, string> = { ...headers }
  if (body !== undefined) requestHeaders['Content-Type'] = 'application/json'
  if (auth) {
    const token = await getAccessToken()
    if (token) requestHeaders.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (response.status === 204) return undefined as T

  const text = await response.text()
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : undefined
  } catch {
    parsed = undefined
  }

  if (!response.ok) {
    const errorBody: ApiErrorBody =
      parsed && typeof parsed === 'object' && 'code' in parsed
        ? (parsed as ApiErrorBody)
        : { code: 'unknown_error', message: `Request failed with status ${response.status}` }
    throw new ApiError(response.status, errorBody)
  }

  return parsed as T
}
