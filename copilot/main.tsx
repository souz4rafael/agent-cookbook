import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CopilotPortal } from '../src/copilot/CopilotPortal.tsx'
import '../src/copilot/portal.css'
import faviconUrl from '../public/favicon.svg?url'

const favicon = document.createElement('link')
favicon.rel = 'icon'
favicon.type = 'image/svg+xml'
favicon.href = faviconUrl
document.head.append(favicon)

createRoot(document.getElementById('root')!).render(
  <StrictMode><CopilotPortal /></StrictMode>,
)
