import { DocumentSparkle20Regular, PersonCircle20Regular } from '@fluentui/react-icons'
import type { BuilderRecipe } from './schema.ts'

export function BuilderIcon({ icon, name, small = false }: { icon: BuilderRecipe['icon']; name: string; small?: boolean }) {
  return <span className={`cb-agent-icon cb-icon-${icon}${small ? ' cb-icon-small' : ''}`} role="img" aria-label={`${name} agent icon`}>
    {icon === 'rle' ? <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M4 6h1m4 0h1m4 0h7a4.5 4.5 0 0 1 0 9H11a4.5 4.5 0 0 0 0 9h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="m25 18 1.5 4.5L31 24l-4.5 1.5L25 30l-1.5-4.5L19 24l4.5-1.5z" fill="currentColor" />
    </svg> : icon === 'expert' ? <PersonCircle20Regular /> : <DocumentSparkle20Regular />}
  </span>
}
