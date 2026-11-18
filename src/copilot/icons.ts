import {
  AddCircle20Filled, AddCircle20Regular, Agents20Regular, ArrowRepeatAll20Regular, AutopilotFace20Regular,
  CheckboxChecked20Regular, Library20Regular, PlugPuzzle20Regular, Search20Regular,
  Settings20Regular, SlideMultiple20Regular,
} from '@fluentui/react-icons'

// Keep product-specific glyphs at their original public URLs rather than redistributing their artwork.
export const copilotIconAssets = {
  tasks: { path: 'apps/bebop-unread-tasks.svg', fallback: CheckboxChecked20Regular },
  new: { path: 'shared/add-circle-filled.svg', fallback: AddCircle20Filled },
  newIdle: { path: 'shared/add-circle.svg', fallback: AddCircle20Regular },
  search: { path: 'apps/search.svg', fallback: Search20Regular },
  autopilot: { path: 'nav-tabs/autopilot-home.svg', fallback: AutopilotFace20Regular },
  library: { path: 'apps/library.svg', fallback: Library20Regular },
  automations: { path: 'cowork/arrow-repeat-all.svg', fallback: ArrowRepeatAll20Regular },
  plugins: { path: 'apps/plugins-v2.svg', fallback: PlugPuzzle20Regular },
  agents: { path: 'apps/bebop-agents.svg', fallback: Agents20Regular },
  workspaces: { path: 'apps/workspaces.svg', fallback: SlideMultiple20Regular },
  settings: { path: 'shared/settings-gear.svg', fallback: Settings20Regular },
} as const

export type CopilotIconName = keyof typeof copilotIconAssets

export function copilotIconUrl(name: CopilotIconName): string {
  return `https://res.public.onecdn.static.microsoft/midgard/versionless/m365copilotresources/${copilotIconAssets[name].path}`
}
