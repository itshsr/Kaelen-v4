import { describe, it, expect } from 'vitest'
import { renderPage } from './renderPage'

import Home from '../pages/Home'
import Core from '../pages/Core'
import Forge from '../pages/Forge'
import Oracle from '../pages/Oracle'
import Grimoire from '../pages/Grimoire'
import Vault from '../pages/Vault'
import Calendar from '../pages/Calendar'
import User from '../pages/User'
import Login from '../pages/Login'

// These are intentionally shallow: "does this page render without throwing
// while signed out / before data loads" — not full behavioral coverage.
// That's still real value: every regression found by screenshot this session
// (bubble alignment breaking, the CSS specificity bug, the duplicate Neon
// color block) involved a component that at minimum still rendered — a
// smoke test wouldn't have caught those specific visual bugs, but it *would*
// catch the class of bug where a page throws and shows a blank screen, which
// happened at least once earlier (the "shell-locked" scroll regression could
// easily have been a hard crash instead of a layout bug on a different day).
describe('page smoke tests', () => {
  it('Login renders', () => {
    expect(() => renderPage(<Login />)).not.toThrow()
  })
  it('Home renders', () => {
    expect(() => renderPage(<Home profileName="Test" />)).not.toThrow()
  })
  it('Core renders', () => {
    expect(() => renderPage(<Core profileName="Test" />)).not.toThrow()
  })
  it('Forge renders', () => {
    expect(() => renderPage(<Forge />)).not.toThrow()
  })
  it('Oracle renders', () => {
    expect(() => renderPage(<Oracle />)).not.toThrow()
  })
  it('Grimoire renders', () => {
    expect(() => renderPage(<Grimoire />)).not.toThrow()
  })
  it('Vault renders', () => {
    expect(() => renderPage(<Vault />)).not.toThrow()
  })
  it('Calendar renders', () => {
    expect(() => renderPage(<Calendar />)).not.toThrow()
  })
  it('User renders', () => {
    expect(() => renderPage(<User />)).not.toThrow()
  })
})
