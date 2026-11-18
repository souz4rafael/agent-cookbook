import { useEffect, useState } from 'react'
import { ArrowLeftRegular as ArrowLeft, WeatherMoonRegular as Moon, WeatherSunnyRegular as Sun } from '@fluentui/react-icons'
import { recipes } from './data.ts'
import { Catalog } from './components/Catalog.tsx'
import { Studio } from './components/Studio.tsx'
import { CookbookMark } from './components/CookbookMark.tsx'
import { readRoute } from './domain/routes.ts'
import './App.css'
import './components/StudioChrome.css'
import './components/Catalog.css'

export function BrandName() {
  return <span className="brand-name"><span className="brand-product">Copilot Studio</span><span>Agents <strong>Cookbook</strong></span></span>
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <a className={`brand${compact ? ' brand-compact' : ''}`} href="#/" aria-label="Copilot Studio Agents Cookbook home">
      <CookbookMark />
      <BrandName />
      <span className="beta-badge">BETA</span>
    </a>
  )
}

export function ThemeToggle({ menuItem = false }: { menuItem?: boolean }) {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  function toggle() {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    setTheme(next)
  }
  if (menuItem) return (
    <button className="menu-dark-mode" type="button" role="menuitemcheckbox" aria-checked={theme === 'dark'} onClick={toggle}>
      <span>Dark mode</span><span className="switch-track" aria-hidden="true" />
    </button>
  )
  return (
    <button className="icon-button theme-toggle" type="button" onClick={toggle}
      aria-label={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`} title={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`}>
      {theme === 'dark' ? <Sun fontSize={18} aria-hidden="true" /> : <Moon fontSize={18} aria-hidden="true" />}
    </button>
  )
}

export default function App() {
  const [route, setRoute] = useState(() => readRoute(window.location.hash))
  useEffect(() => {
    const onHashChange = () => {
      setRoute(readRoute(window.location.hash))
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  const recipe = route.kind === 'recipe' ? recipes.find(item => item.id === route.id) : undefined
  useEffect(() => {
    document.title = `${recipe?.title ?? (route.kind === 'agents' ? 'Agents' : route.kind === 'scenarios' ? 'Explore business scenarios' : 'Learn by building')} · Copilot Studio Agents Cookbook`
  }, [recipe, route.kind])

  if (route.kind === 'home' || route.kind === 'agents' || route.kind === 'scenarios') return <Catalog key={route.kind === 'agents' ? `agents:${route.search}` : route.kind} recipes={recipes} page={route.kind} initialSearch={route.kind === 'agents' ? route.search : ''} />
  if (recipe) return <Studio key={`${recipe.id}:${recipe.revision}`} recipe={recipe} />
  return (
    <div className="not-found">
      <Brand />
      <main>
        <span className="eyebrow">LET’S FIND YOUR NEXT RECIPE</span>
        <h1>This recipe is not in the catalogue.</h1>
        <p>The address may have changed. Explore the available recipes to get started.</p>
        <a className="button primary" href="#/agents"><ArrowLeft fontSize={17} aria-hidden="true" /> Back to agents</a>
      </main>
    </div>
  )
}
