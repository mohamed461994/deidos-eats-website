/**
 * The step-by-step item customization wizard — one modifier group per step,
 * with a running summary, live price, and honest gating. Replaces the
 * all-groups-at-once dialog for items that have modifier groups; zero-group
 * items keep the plain detail view (see `item-dialog.tsx`).
 *
 * Selection state lives entirely in {@link useItemWizard} (never lifted above
 * this component). All predicates come from the pure `modifier-selection`
 * module; all prices go through `effectiveUnitPriceCents`, so the wizard can
 * never disagree with the cart. The wizard renders its own persistent footer
 * inside the caller's footer chrome, and swaps in `footerOverride` (the
 * branch-conflict confirm block) when the cart needs the buyer to decide.
 */
import { Check, ChevronLeft } from 'lucide-react'
import { useEffect, useId, useReducer, useRef, type ReactNode, type RefObject } from 'react'

import type { MenuItem, ModifierGroup, ModifierOption } from '@/api/types'
import { effectiveUnitPriceCents } from '@/cart/cart'
import { FoodImage } from '@/components/food-image'
import { PriceWasNow } from '@/components/price-was-now'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { QuantityStepper } from '@/components/ui/quantity'
import { formatCents } from '@/lib/money'
import {
  canSelect,
  emptySelection,
  helperText,
  isOptional,
  isSatisfiable,
  isSatisfied,
  isSelected,
  isSingleChoice,
  selectedOptions,
  selectionCount,
  shouldAutoAdvance,
  toggleOption,
  type ModifierSelection,
} from '@/lib/modifier-selection'
import { cn } from '@/lib/utils'

/** How long a completed single-choice / exact-count step stays visible before
 *  auto-advancing — long enough that the tap visibly registers. */
const AUTO_ADVANCE_MS = 350

/* ---- Reducer ----------------------------------------------------------- */

interface WizardState {
  selection: ModifierSelection
  /** The step currently on screen. */
  stepIndex: number
  /** The furthest step reached — the ceiling for jump-back navigation. */
  furthestIndex: number
  /** When editing an earlier step, where to return once it's done (else null). */
  returnToIndex: number | null
  /** Fixed for the item's lifetime (this component remounts per item). */
  totalSteps: number
  /**
   * What produced the current state, so auto-advance only ever responds to a
   * choice made ON the current step — never to merely arriving at a step that
   * happens to be complete (jumping back to an already-picked single-choice
   * step must let the buyer actually change it, not bounce straight back).
   */
  lastAction: 'toggle' | 'nav'
}

type WizardAction =
  | { type: 'toggle'; group: ModifierGroup; option: ModifierOption }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'jumpTo'; index: number }

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'toggle':
      return {
        ...state,
        selection: toggleOption(state.selection, action.group, action.option),
        lastAction: 'toggle',
      }
    case 'next': {
      // "Next"/"Skip"/"Done" and auto-advance share this: return to the step we
      // came back from when revisiting, otherwise step forward by one.
      const target = state.returnToIndex ?? state.stepIndex + 1
      const clamped = Math.min(Math.max(target, 0), state.totalSteps - 1)
      return {
        ...state,
        stepIndex: clamped,
        furthestIndex: Math.max(state.furthestIndex, clamped),
        returnToIndex: null,
        lastAction: 'nav',
      }
    }
    case 'back':
      return { ...state, stepIndex: Math.max(0, state.stepIndex - 1), lastAction: 'nav' }
    case 'jumpTo': {
      if (action.index < 0 || action.index > state.furthestIndex) return state
      return {
        ...state,
        stepIndex: action.index,
        // Remember the furthest step so finishing the edit returns there.
        returnToIndex:
          state.furthestIndex > action.index ? state.furthestIndex : state.returnToIndex,
        lastAction: 'nav',
      }
    }
  }
}

function useItemWizard(steps: readonly ModifierGroup[]) {
  return useReducer(wizardReducer, steps, (s) => ({
    selection: emptySelection(),
    stepIndex: 0,
    furthestIndex: 0,
    returnToIndex: null,
    totalSteps: s.length,
    lastAction: 'nav' as const,
  }))
}

/* ---- Derivations ------------------------------------------------------- */

/** The chosen option names for a group, in group order — for the summary. */
function chosenNames(group: ModifierGroup, selection: ModifierSelection): string[] {
  const ids = selection.get(group.id)
  if (!ids) return []
  return group.options.filter((o) => ids.has(o.id)).map((o) => o.name)
}

/* ---- OptionTile -------------------------------------------------------- */

/**
 * One choice, as a tile wrapping a native radio (single-choice) or checkbox
 * (multi). Native inputs keep keyboard + arrow-key behaviour free; the tile
 * carries the checkout selected-tile visual language. Disabled = sold out or
 * (multi) at the cap — proactive, never an error. A checked single-choice radio
 * is de-selectable by re-clicking (its `onChange` doesn't fire, so `onClick`
 * handles it; guarded on the render-time `selected` so a fresh pick never
 * double-toggles).
 */
function OptionTile({
  group,
  option,
  selection,
  onToggle,
}: {
  group: ModifierGroup
  option: ModifierOption
  selection: ModifierSelection
  onToggle: () => void
}) {
  const single = isSingleChoice(group)
  const selected = isSelected(selection, group.id, option.id)
  const disabled = !selected && !canSelect(selection, group, option)
  const delta = option.priceDeltaCents

  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-[16px] border px-4 py-3.5 transition-colors',
        'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ember has-[:focus-visible]:outline-offset-2',
        selected
          ? 'border-basil bg-basil-tint text-basil-deep'
          : 'border-border text-ink hover:bg-surface',
        disabled && 'cursor-not-allowed opacity-45 hover:bg-transparent',
      )}
    >
      <input
        type={single ? 'radio' : 'checkbox'}
        name={single ? group.id : undefined}
        className="sr-only"
        checked={selected}
        disabled={disabled}
        onChange={onToggle}
        onClick={single && selected ? onToggle : undefined}
      />
      <span
        aria-hidden
        className={cn(
          'grid size-5 shrink-0 place-items-center border transition-colors',
          single ? 'rounded-full' : 'rounded-[6px]',
          selected ? 'border-basil bg-basil text-on-basil' : 'border-border',
        )}
      >
        {selected &&
          (single ? <span className="size-2 rounded-full bg-on-basil" /> : <Check className="size-3.5" />)}
      </span>
      <span className="flex-1 text-[15px] font-[550]">
        {option.name}
        {!option.isAvailable && <span className="ml-2 text-[13px] font-[400] text-muted">Sold out</span>}
      </span>
      {delta > 0 && (
        <span className={cn('tabular-nums text-[15px]', selected ? 'text-basil-deep' : 'text-muted')}>
          +{formatCents(delta)}
        </span>
      )}
    </label>
  )
}

/* ---- Step header ------------------------------------------------------- */

function WizardStepHeader({
  group,
  stepIndex,
  totalSteps,
  headingId,
  headingRef,
}: {
  group: ModifierGroup
  stepIndex: number
  totalSteps: number
  headingId: string
  headingRef: RefObject<HTMLHeadingElement | null>
}) {
  const optional = isOptional(group)
  const progress = ((stepIndex + 1) / totalSteps) * 100
  return (
    <div className="flex flex-col gap-2">
      {totalSteps > 1 && (
        <div className="flex items-center gap-2.5">
          <span className="text-[13px] font-[550] text-muted">
            Step {stepIndex + 1} of {totalSteps}
          </span>
          <Badge variant={optional ? 'neutral' : 'basil-soft'}>{optional ? 'Optional' : 'Required'}</Badge>
        </div>
      )}
      <h3 id={headingId} ref={headingRef} tabIndex={-1} className="display text-2xl focus:outline-none">
        {group.name}
      </h3>
      <p className="text-[13px] font-[550] text-muted">{helperText(group)}</p>
      {totalSteps > 1 && (
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface" aria-hidden>
          <div
            className="h-full rounded-full bg-basil transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  )
}

/* ---- Summary (desktop left pane + shared row model) -------------------- */

interface StepRow {
  index: number
  name: string
  chosen: string[]
  reached: boolean
  current: boolean
  done: boolean
}

function stepRows(steps: readonly ModifierGroup[], state: WizardState): StepRow[] {
  return steps.map((group, index) => ({
    index,
    name: group.name,
    chosen: chosenNames(group, state.selection),
    reached: index <= state.furthestIndex,
    current: index === state.stepIndex,
    done:
      index < state.stepIndex || (index <= state.furthestIndex && isSatisfied(state.selection, group)),
  }))
}

/** What a reached step shows in the summary: the chosen names, or a status word. */
function summaryValue(row: StepRow, group: ModifierGroup): string {
  if (row.chosen.length > 0) return row.chosen.join(', ')
  return isOptional(group) ? 'None' : 'Choose'
}

function WizardSummary({
  item,
  steps,
  state,
  totalCents,
  onJump,
}: {
  item: MenuItem
  steps: readonly ModifierGroup[]
  state: WizardState
  totalCents: number
  onJump: (index: number) => void
}) {
  const rows = stepRows(steps, state)
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border sm:flex">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
        <FoodImage
          src={item.imageUrl ?? null}
          alt={item.description ?? item.name}
          fallbackLabel={item.name}
          className="aspect-[4/3] w-full rounded-[16px]"
        />
        <h2 className="display mt-3 text-lg">{item.name}</h2>
        {item.onlinePromoPriceCents != null ? (
          <PriceWasNow
            baseCents={item.priceCents}
            promoCents={item.onlinePromoPriceCents}
            className="mt-1 text-[15px]"
          />
        ) : (
          <p className="tabular-nums mt-1 text-[15px] font-[650]">{formatCents(item.priceCents)}</p>
        )}
        {item.allergens.length > 0 && (
          <p className="mt-2 text-[13px] text-muted">
            Contains: {item.allergens.map((a) => ALLERGEN_LABELS[a] ?? a).join(', ')}
          </p>
        )}

        <ol className="mt-4 flex flex-col gap-0.5">
          {rows.map((row) => {
            const group = steps[row.index]
            const value = summaryValue(row, group)
            const content = (
              <>
                <span className="mt-0.5 grid size-4 shrink-0 place-items-center">
                  {row.done ? (
                    <Check className="size-4 text-basil" aria-hidden />
                  ) : (
                    <span
                      className={cn(
                        'size-2 rounded-full',
                        row.current ? 'bg-basil' : 'bg-border',
                      )}
                      aria-hidden
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block text-[13px] font-[550]',
                      row.current ? 'text-basil-deep' : row.reached ? 'text-ink' : 'text-muted',
                    )}
                  >
                    {row.name}
                  </span>
                  {row.reached && (
                    <span className="block truncate text-[13px] text-muted">{value}</span>
                  )}
                </span>
              </>
            )
            const base = 'flex items-start gap-2 rounded-[10px] px-2 py-1.5 text-left'
            // Reached, non-current steps are tappable to jump back and edit;
            // the current step and unreached steps are not interactive.
            return row.reached && !row.current ? (
              <li key={group.id}>
                <button
                  type="button"
                  onClick={() => onJump(row.index)}
                  className={cn(base, 'w-full transition-colors hover:bg-surface')}
                  aria-label={`Edit ${row.name}: ${value}`}
                >
                  {content}
                </button>
              </li>
            ) : (
              <li
                key={group.id}
                className={cn(base, row.current && 'bg-basil-tint')}
                aria-current={row.current ? 'step' : undefined}
              >
                {content}
              </li>
            )
          })}
        </ol>
      </div>
      <div className="flex items-center justify-between border-t border-border px-5 py-3">
        <span className="text-[13px] font-[550] text-muted">Total</span>
        <span className="tabular-nums text-lg font-[750]">{formatCents(totalCents)}</span>
      </div>
    </aside>
  )
}

/* ---- Mobile chip strip ------------------------------------------------- */

function MobileChipStrip({
  steps,
  state,
  onJump,
}: {
  steps: readonly ModifierGroup[]
  state: WizardState
  onJump: (index: number) => void
}) {
  const rows = stepRows(steps, state).filter((r) => r.reached)
  return (
    <div className="flex gap-2 overflow-x-auto overscroll-contain border-b border-border px-6 py-2.5 sm:hidden">
      {rows.map((row) => {
        const group = steps[row.index]
        const value = summaryValue(row, group)
        return (
          <button
            key={group.id}
            type="button"
            onClick={() => onJump(row.index)}
            disabled={row.current}
            aria-label={`Edit step ${row.index + 1}: ${row.name} — ${value}`}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-[550] transition-colors',
              row.current
                ? 'border-basil bg-basil-tint text-basil-deep'
                : 'border-border text-muted hover:bg-surface',
            )}
          >
            {row.done && !row.current && <Check className="size-3.5 text-basil" aria-hidden />}
            <span className="max-w-32 truncate">{row.name}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ---- Footer ------------------------------------------------------------ */

interface CtaModel {
  label: ReactNode
  variant: 'primary' | 'outline'
  enabled: boolean
  action: 'add' | 'next'
}

function ctaModel(
  state: WizardState,
  steps: readonly ModifierGroup[],
  totalCents: number,
): CtaModel {
  const step = steps[state.stepIndex]
  const satisfied = isSatisfied(state.selection, step)
  const revisiting = state.returnToIndex !== null
  const isLast = state.stepIndex === steps.length - 1

  if (revisiting) return { label: 'Done', variant: 'primary', enabled: satisfied, action: 'next' }
  if (isLast)
    return {
      label: `Add · ${formatCents(totalCents)}`,
      variant: 'primary',
      enabled: satisfied,
      action: 'add',
    }
  if (isOptional(step) && selectionCount(state.selection, step.id) === 0)
    return { label: 'Skip', variant: 'outline', enabled: true, action: 'next' }
  return { label: 'Next', variant: 'primary', enabled: satisfied, action: 'next' }
}

function WizardFooter({
  item,
  cta,
  showBack,
  showRunningTotal,
  totalCents,
  quantity,
  onQuantityChange,
  onBack,
  onNext,
  onAdd,
}: {
  item: MenuItem
  cta: CtaModel
  showBack: boolean
  showRunningTotal: boolean
  totalCents: number
  quantity: number
  onQuantityChange: (q: number) => void
  onBack: () => void
  onNext: () => void
  onAdd: () => void
}) {
  return (
    <div className="flex items-center gap-3">
      {showBack && (
        <Button variant="ghost" size="sm" onClick={onBack} aria-label="Back to the previous step">
          <ChevronLeft className="size-4" aria-hidden />
          Back
        </Button>
      )}
      <QuantityStepper value={quantity} onChange={onQuantityChange} size="sm" label={item.name} />
      <div className="ml-auto flex flex-1 items-center justify-end gap-3">
        {/* Intermediate steps keep the price visible (desktop; mobile shows it in
            the compact header / hero). The last step's CTA carries it instead. */}
        {showRunningTotal && (
          <span className="tabular-nums hidden text-lg font-[750] sm:block">
            {formatCents(totalCents)}
          </span>
        )}
        <Button
          variant={cta.variant}
          size="lg"
          className="flex-1 sm:flex-none sm:min-w-[8rem]"
          disabled={!cta.enabled}
          onClick={cta.action === 'add' ? onAdd : onNext}
        >
          {cta.label}
        </Button>
      </div>
    </div>
  )
}

/* ---- ItemWizard -------------------------------------------------------- */

interface ItemWizardProps {
  item: MenuItem
  /** The pre-filtered wizard steps (see `wizardSteps`); never empty. */
  steps: ModifierGroup[]
  quantity: number
  onQuantityChange: (q: number) => void
  /** Commit the current selection to the cart (last step / single-step Add). */
  onAdd: (options: ModifierOption[]) => void
  /** Replaces the footer content (branch-conflict confirm) while set. */
  footerOverride?: ReactNode
}

export function ItemWizard({
  item,
  steps,
  quantity,
  onQuantityChange,
  onAdd,
  footerOverride,
}: ItemWizardProps) {
  const [state, dispatch] = useItemWizard(steps)
  const { stepIndex, furthestIndex } = state
  const step = steps[stepIndex]
  const totalSteps = steps.length

  const chosen = selectedOptions(state.selection, steps)
  const totalCents = effectiveUnitPriceCents(item, chosen) * quantity

  const cta = ctaModel(state, steps, totalCents)
  const stepUnsatisfiable = !isSatisfiable(step)
  // Surfaced early on step 1 so the buyer isn't marched to a dead end.
  const laterUnsatisfiable =
    stepIndex === 0 ? steps.slice(1).filter((g) => !isSatisfiable(g)) : []

  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // On every step change: reset the step-pane scroll and move focus to the step
  // heading (Radix doesn't move focus on content swaps). preventScroll so the
  // focus call never fights the scroll reset.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    headingRef.current?.focus({ preventScroll: true })
  }, [stepIndex])

  // Auto-advance: one timer, scheduled only after a choice made ON this step
  // leaves it complete with nothing more to pick (single-choice / exact-count),
  // never on the last step. Gating on `lastAction === 'toggle'` means arriving
  // at an already-complete step (e.g. jumping back to edit) never bounces the
  // buyer forward. The effect re-runs (cancelling any pending timer) on every
  // change, so a fired timer is always consistent with current state and can
  // never auto-fire "Add".
  useEffect(() => {
    if (state.lastAction !== 'toggle') return
    if (stepIndex >= totalSteps - 1) return
    if (!shouldAutoAdvance(state.selection, step)) return
    const timer = setTimeout(() => dispatch({ type: 'next' }), AUTO_ADVANCE_MS)
    return () => clearTimeout(timer)
  }, [state.lastAction, state.selection, stepIndex, step, totalSteps, dispatch])

  const announcement =
    totalSteps > 1
      ? `Step ${stepIndex + 1} of ${totalSteps}: ${step.name} — ${helperText(step)}`
      : `${step.name} — ${helperText(step)}`

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      <div className="flex min-h-0 flex-1 sm:flex-row">
        <WizardSummary
          item={item}
          steps={steps}
          state={state}
          totalCents={totalCents}
          onJump={(index) => dispatch({ type: 'jumpTo', index })}
        />

        <div className="flex min-h-0 flex-1 flex-col">
          {/* Mobile: compact sticky header once past the appetite-forward entry.
              Right padding clears the floating close button. */}
          {stepIndex > 0 && (
            <div className="flex items-center gap-3 border-b border-border py-2.5 pl-6 pr-16 sm:hidden">
              <FoodImage
                src={item.imageUrl ?? null}
                alt=""
                fallbackLabel={item.name}
                className="size-10 shrink-0 rounded-[10px]"
              />
              <span className="display min-w-0 flex-1 truncate text-base">{item.name}</span>
              <span className="tabular-nums shrink-0 font-[750]">{formatCents(totalCents)}</span>
            </div>
          )}
          {furthestIndex > 0 && (
            <MobileChipStrip
              steps={steps}
              state={state}
              onJump={(index) => dispatch({ type: 'jumpTo', index })}
            />
          )}

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {/* Mobile: full appetite-forward hero on the entry step only. */}
            {stepIndex === 0 && (
              <div className="sm:hidden">
                <FoodImage
                  src={item.imageUrl ?? null}
                  alt={item.description ?? item.name}
                  fallbackLabel={item.name}
                  className="aspect-[16/9] w-full rounded-t-[24px]"
                />
                <div className="flex flex-col gap-2 px-6 pt-5">
                  <h2 className="display text-2xl">{item.name}</h2>
                  {item.description && <p className="text-[15px] text-muted">{item.description}</p>}
                  {item.onlinePromoPriceCents != null ? (
                    <PriceWasNow
                      baseCents={item.priceCents}
                      promoCents={item.onlinePromoPriceCents}
                      showSaving
                      className="text-lg"
                    />
                  ) : (
                    <p className="tabular-nums text-lg font-[750]">{formatCents(item.priceCents)}</p>
                  )}
                  {item.allergens.length > 0 && (
                    <p className="text-[13px] text-muted">
                      Contains: {item.allergens.map((a) => ALLERGEN_LABELS[a] ?? a).join(', ')}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-4 px-6 py-5">
              <WizardStepHeader
                group={step}
                stepIndex={stepIndex}
                totalSteps={totalSteps}
                headingId={headingId}
                headingRef={headingRef}
              />

              {laterUnsatisfiable.length > 0 && (
                <p
                  role="status"
                  className="rounded-[16px] border border-warning/40 bg-crust-tint px-4 py-3 text-[13px]"
                >
                  Some later choices are sold out today ({laterUnsatisfiable.map((g) => g.name).join(', ')}),
                  so this item may not be available right now.
                </p>
              )}

              {stepUnsatisfiable ? (
                <p
                  role="alert"
                  className="rounded-[16px] border border-error/40 bg-error-tint px-4 py-3.5 text-[15px]"
                >
                  Not enough options are available in “{step.name}” to complete this choice right now.
                  Please try another item.
                </p>
              ) : (
                <div
                  role={isSingleChoice(step) ? 'radiogroup' : 'group'}
                  aria-labelledby={headingId}
                  className="flex flex-col gap-2"
                >
                  {step.options.map((option) => (
                    <OptionTile
                      key={option.id}
                      group={step}
                      option={option}
                      selection={state.selection}
                      onToggle={() => dispatch({ type: 'toggle', group: step, option })}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-border bg-bg px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {footerOverride ?? (
          <WizardFooter
            item={item}
            cta={cta}
            showBack={stepIndex > 0}
            showRunningTotal={cta.action !== 'add'}
            totalCents={totalCents}
            quantity={quantity}
            onQuantityChange={onQuantityChange}
            onBack={() => dispatch({ type: 'back' })}
            onNext={() => dispatch({ type: 'next' })}
            onAdd={() => onAdd(chosen)}
          />
        )}
      </div>
    </div>
  )
}

/** Allergen code → label (shared shape with the item dialog). */
const ALLERGEN_LABELS: Record<string, string> = {
  gluten: 'Gluten',
  crustaceans: 'Crustaceans',
  eggs: 'Eggs',
  fish: 'Fish',
  peanuts: 'Peanuts',
  soybeans: 'Soya',
  milk: 'Milk',
  nuts: 'Tree nuts',
  celery: 'Celery',
  mustard: 'Mustard',
  sesame: 'Sesame',
  sulphites: 'Sulphites',
  lupin: 'Lupin',
  molluscs: 'Molluscs',
}
