import { BookOpenRegular } from '@fluentui/react-icons'

export function CookbookMark({ className = 'brand-mark' }: { className?: string }) {
  return <span className={className} aria-hidden="true"><BookOpenRegular fontSize={22} /></span>
}
