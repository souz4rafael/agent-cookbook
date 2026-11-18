import type { ReactNode } from 'react'
import { collectionHomeHref } from './catalog.ts'
import './navigation.css'

export function CollectionLink({ className, children }: { className: string; children: ReactNode }) {
  if (import.meta.env.VITE_COOKBOOK_COLLECTION !== 'true') return null
  const href = () => collectionHomeHref(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  return <a className={`${className} collection-home-link`} href={href()} title="All cookbooks" aria-label="All cookbooks"
    onClick={event => { event.currentTarget.href = href() }}>{children}</a>
}
