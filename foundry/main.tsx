import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { FoundryPortal } from '../src/foundry/FoundryPortal.tsx'
import '../src/foundry/portal.css'
import faviconUrl from '../public/favicon.svg?url'

const favicon = document.createElement('link')
favicon.rel = 'icon'
favicon.type = 'image/svg+xml'
favicon.href = faviconUrl
document.head.append(favicon)

createRoot(document.getElementById('root')!).render(
  <StrictMode><FoundryPortal /></StrictMode>,
)
