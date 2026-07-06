import { ArrowRight, Clock, Flame, MapPin } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { useMenu, useRestaurant } from '@/api/queries'
import { FoodImage } from '@/components/food-image'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { HERO_IMAGE, SHARING_IMAGE } from '@/lib/brand'
import { useSelectedBranch } from '@/lib/branch-selection'
import { formatCents } from '@/lib/money'

export function HomePage() {
  const navigate = useNavigate()
  const { data: restaurant } = useRestaurant()
  const [selectedBranchId, selectBranch] = useSelectedBranch()
  const branchId = selectedBranchId ?? restaurant?.branches[0]?.id ?? null
  const { data: menu } = useMenu(branchId)

  const highlights =
    menu?.categories
      .flatMap((c) => c.items)
      .filter((i) => i.imageUrl && i.isAvailable)
      .slice(0, 5) ?? []

  return (
    <main>
      {/* Hero — the photograph is the design; one orchestrated entrance */}
      <section className="relative isolate flex min-h-[82dvh] items-end overflow-hidden bg-basil-deep">
        <img
          src={HERO_IMAGE}
          alt="A wood-fired margherita, blistered crust, fresh basil on molten mozzarella"
          className="absolute inset-0 size-full object-cover"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-[oklch(0.2_0.07_143/0.88)] via-[oklch(0.2_0.07_143/0.35)] to-[oklch(0.2_0.07_143/0.15)]"
        />
        <div className="relative mx-auto w-full max-w-6xl px-4 pb-14 pt-40 sm:px-6 sm:pb-20">
          <p className="rise-in flex items-center gap-2 font-[650] text-paper">
            <Flame className="size-4 text-ember" aria-hidden />
            Wood-fired in Dublin &amp; Cork
          </p>
          <h1 className="display rise-in mt-3 max-w-3xl text-paper text-[clamp(2.75rem,8vw,5.5rem)]">
            Fierce good pizza.
          </h1>
          <p className="rise-in-late mt-4 max-w-xl text-lg text-paper-muted">
            Forty-eight-hour dough, a 450° oven, and a little mischief. Order for collection
            or delivery and track it from our fire to your door.
          </p>
          <div className="rise-in-late mt-8 flex flex-wrap gap-3">
            <Button variant="paper" size="lg" onClick={() => navigate('/menu')}>
              Order now
              <ArrowRight className="size-4.5" aria-hidden />
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="text-paper hover:bg-paper/10"
              onClick={() => navigate('/locations')}
            >
              <MapPin className="size-4.5" aria-hidden />
              Find us
            </Button>
          </div>
        </div>
      </section>

      {/* From the oven — real menu data, horizontal appetite strip */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24" aria-labelledby="highlights-heading">
        <div className="flex items-end justify-between gap-4">
          <h2 id="highlights-heading" className="display text-[clamp(2rem,4.5vw,3.25rem)]">
            From the oven
          </h2>
          <Link
            to="/menu"
            className="mb-1.5 shrink-0 font-[650] text-basil underline-offset-4 hover:underline"
          >
            Full menu
          </Link>
        </div>
        <div className="-mx-4 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
          {highlights.length === 0
            ? Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="w-64 shrink-0 sm:w-72">
                  <Skeleton className="aspect-[4/3] w-full rounded-[16px]" />
                  <Skeleton className="mt-3 h-5 w-2/3" />
                </div>
              ))
            : highlights.map((item) => (
                <Link
                  key={item.id}
                  to="/menu"
                  className="group w-64 shrink-0 snap-start sm:w-72"
                >
                  <div className="overflow-hidden rounded-[16px]">
                    <FoodImage
                      src={item.imageUrl ?? null}
                      alt={item.description ?? item.name}
                      className="aspect-[4/3] w-full transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]"
                    />
                  </div>
                  <div className="mt-3 flex items-baseline justify-between gap-2">
                    <p className="font-[650]">{item.name}</p>
                    <p className="tabular-nums text-muted">{formatCents(item.priceCents)}</p>
                  </div>
                </Link>
              ))}
        </div>
      </section>

      {/* The ordering promise — a real 3-step sequence, so the numbers mean something */}
      <section className="bg-basil-deep text-paper" aria-labelledby="promise-heading">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <h2 id="promise-heading" className="display text-[clamp(2rem,4.5vw,3.25rem)]">
            Hunger to doorbell
          </h2>
          <ol className="mt-10 grid gap-10 sm:grid-cols-3 sm:gap-8">
            {[
              {
                title: 'Pick your branch',
                body: 'Ranelagh or Washington Street. Collection or delivery — your call.',
              },
              {
                title: 'Build your order',
                body: 'Every pizza customisable, every allergen listed, no surprises at the till.',
              },
              {
                title: 'Track it live',
                body: 'Watch your order move from placed to fired to out the door, minute by minute.',
              },
            ].map((step, index) => (
              <li key={step.title} className="relative">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-ember font-[750] text-on-ember"
                  >
                    {index + 1}
                  </span>
                  <h3 className="text-lg font-[650]">{step.title}</h3>
                </div>
                <p className="mt-3 text-[15px] leading-relaxed text-paper-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Branches */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24" aria-labelledby="branches-heading">
        <h2 id="branches-heading" className="display text-[clamp(2rem,4.5vw,3.25rem)]">
          Two ovens, one fire
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {(restaurant?.branches ?? []).map((branch) => (
            <article
              key={branch.id}
              className="group overflow-hidden rounded-[24px] border border-border bg-bg shadow-raised"
            >
              <FoodImage
                src={branch.imageUrl ?? null}
                alt={`${branch.name} — the food`}
                className="aspect-[16/9] w-full"
              />
              <div className="flex flex-col gap-3 p-6">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="display text-xl">{branch.name}</h3>
                  <span
                    className={
                      branch.isOpen
                        ? 'flex items-center gap-1.5 text-sm font-[650] text-basil'
                        : 'flex items-center gap-1.5 text-sm font-[650] text-muted'
                    }
                  >
                    <Clock className="size-4" aria-hidden />
                    {branch.isOpen ? 'Open now' : 'Closed'}
                  </span>
                </div>
                <p className="text-[15px] text-muted">{branch.town}</p>
                <Button
                  className="mt-1 self-start"
                  onClick={() => {
                    selectBranch(branch.id)
                    navigate('/menu')
                  }}
                >
                  Order from here
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Closing appetite note */}
      <section className="relative isolate overflow-hidden">
        <img
          src={SHARING_IMAGE}
          alt="Friends sharing pizza around an outdoor table"
          className="absolute inset-0 size-full object-cover"
        />
        <div aria-hidden className="absolute inset-0 bg-[oklch(0.2_0.07_143/0.72)]" />
        <div className="relative mx-auto flex max-w-6xl flex-col items-start gap-5 px-4 py-24 sm:px-6 sm:py-32">
          <h2 className="display max-w-2xl text-paper text-[clamp(2rem,5vw,3.75rem)]">
            The púca shows up when you least expect it. Your pizza shouldn’t.
          </h2>
          <Button variant="paper" size="lg" onClick={() => navigate('/menu')}>
            Start an order
            <ArrowRight className="size-4.5" aria-hidden />
          </Button>
        </div>
      </section>
    </main>
  )
}
