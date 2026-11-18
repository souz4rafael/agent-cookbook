import { useEffect, useState } from 'react'
import { copilotIconAssets, copilotIconUrl } from './icons.ts'
import type { CopilotIconName } from './icons.ts'

const assets = new Map<CopilotIconName, Promise<boolean>>()

function loadIcon(name: CopilotIconName): Promise<boolean> {
  const cached = assets.get(name)
  if (cached) return cached
  const result = new Promise<boolean>(resolve => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.referrerPolicy = 'no-referrer'
    image.onload = () => resolve(true)
    image.onerror = () => {
      console.warn(`Copilot ${name} icon is unavailable; using its bundled Fluent fallback.`)
      resolve(false)
    }
    image.src = copilotIconUrl(name)
  })
  assets.set(name, result)
  return result
}

export function CopilotIcon({ name }: { name: CopilotIconName }) {
  const [loadedName, setLoadedName] = useState<CopilotIconName | null>(null)
  useEffect(() => {
    let active = true
    void loadIcon(name).then(loaded => { if (active && loaded) setLoadedName(name) })
    return () => { active = false }
  }, [name])
  const Fallback = copilotIconAssets[name].fallback
  return <span className="cp-reference-icon" data-copilot-icon={name}
    data-icon-source={loadedName === name ? 'reference' : 'bundled'} aria-hidden="true">
    {loadedName === name
      ? <span className="cp-icon-mask" style={{ maskImage: `url("${copilotIconUrl(name)}")`, WebkitMaskImage: `url("${copilotIconUrl(name)}")` }} />
      : <Fallback />}
  </span>
}

export function CopilotSidebarIcon() {
  return <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true">
    <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" />
    <path d="M8 3.5v13" />
  </svg>
}
