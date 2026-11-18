import { useState } from 'react'
import { ArrowRightRegular, WeatherMoonRegular, WeatherSunnyRegular } from '@fluentui/react-icons'
import { CookbookMark } from '../src/components/CookbookMark.tsx'
import { cookbookHref, cookbooks } from '../src/collection/catalog.ts'
import './style.css'

export function Hub() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    setTheme(next)
  }
  return (
    <div className="hub">
      <a className="skip-link" href="#cookbooks">Skip to cookbooks</a>
      <header className="hub-header">
        <a className="hub-brand" href="./index.html" aria-label="Agents Cookbooks home">
          <CookbookMark className="hub-mark" />
          <span>Agents <strong>Cookbooks</strong></span>
        </a>
        <button className="theme-button" onClick={toggleTheme} aria-label={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`}>
          {theme === 'dark' ? <WeatherSunnyRegular /> : <WeatherMoonRegular />}
        </button>
      </header>
      <main>
        <section className="hub-intro" aria-labelledby="hub-title">
          <p className="eyebrow">THREE EXPERIENCES. ONE PLACE TO START.</p>
          <h1 id="hub-title">Learn agents.<br />One recipe at a time.</h1>
          <p>Choose the product you want to explore. Start with a business problem, follow a recipe and discover what you would need to build it for real.</p>
        </section>
        <section id="cookbooks" className="cookbook-grid" aria-label="Choose a cookbook">
          {cookbooks.map(cookbook => (
            <article key={cookbook.id} className="cookbook-card">
              <CookbookMark className="card-mark" />
              <p className="card-audience">{cookbook.audience}</p>
              <h2><span>{cookbook.product}</span>Agents Cookbook</h2>
              <p>{cookbook.description}</p>
              <p className="card-experience">{cookbook.experience}</p>
              <a className="open-cookbook" href={cookbookHref(cookbook.id, theme)} aria-label={`Open ${cookbook.product} Agents Cookbook`}>
                Open cookbook <ArrowRightRegular aria-hidden="true" />
              </a>
            </article>
          ))}
        </section>
        <aside className="hub-boundary" aria-label="About these learning experiences">
          <strong>A place to learn, not a live agent service.</strong>
          <p>This personal project is not affiliated with, sponsored by or endorsed by Microsoft. These are educational simulations, not Microsoft product portals. Use fictional data only: there are no live AI calls, account connections, contact forms or real deployments. Exercise progress stays in your browser.</p>
        </aside>
      </main>
      <footer>Independent personal project by souz4rafael. Original material: <a href="./LICENSE.txt">rights reserved</a>. <a href="./THIRD-PARTY-NOTICES.txt">Third-party notices</a>.</footer>
    </div>
  )
}
