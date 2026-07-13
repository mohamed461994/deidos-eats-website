import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Entrance-stagger delay for card lists (home strips + branch feed): 40 ms
 * steps, capped after the first few — a long tail of delays reads as lag,
 * not craft (DESIGN.md motion rules).
 */
export function staggerDelayMs(index: number, stepMs = 40, maxIndex = 5): string {
  return `${Math.min(index, maxIndex) * stepMs}ms`
}
