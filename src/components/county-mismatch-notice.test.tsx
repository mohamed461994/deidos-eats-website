import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CountyMismatchNotice } from './county-mismatch-notice'

afterEach(() => {
  cleanup()
})

describe('CountyMismatchNotice', () => {
  it('warns when the branch and address counties differ', () => {
    render(<CountyMismatchNotice branchCounty="Dublin" addressCounty="Cork" />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Dublin')
    expect(alert).toHaveTextContent('Cork')
  })

  it('renders nothing when the counties match (normalized)', () => {
    const { container } = render(
      <CountyMismatchNotice branchCounty="Co. Cork" addressCounty="cork" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when a county is unknown', () => {
    const { container } = render(
      <CountyMismatchNotice branchCounty="Cork" addressCounty={null} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('offers a one-tap switch when a matching branch is suggested', () => {
    const onSwitch = vi.fn()
    render(
      <CountyMismatchNotice
        branchCounty="Dublin"
        addressCounty="Cork"
        suggestion={{ branchName: 'Púca Washington Street', onSwitch }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /switch to Púca Washington Street/i }))
    expect(onSwitch).toHaveBeenCalledOnce()
  })

  it('has no switch button when there is no suggestion', () => {
    render(<CountyMismatchNotice branchCounty="Dublin" addressCounty="Cork" />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
