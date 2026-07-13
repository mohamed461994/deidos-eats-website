import '@testing-library/jest-dom/vitest'

// jsdom gaps every suite that mounts <App/> trips over, stubbed once here:
// IntersectionObserver (menu scrollspy) and scrollTo/scrollIntoView (route +
// category-nav scrolling; jsdom's own scrollTo only logs "Not implemented").
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}
window.IntersectionObserver = IntersectionObserverStub as unknown as typeof IntersectionObserver
window.scrollTo = () => {}
Element.prototype.scrollIntoView = () => {}
