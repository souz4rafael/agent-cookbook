import { useEffect, useState } from 'react'
import { builderRecipes } from './catalog.ts'
import { builderStorageKey, createBuilderDraft, decodeBuilderDrafts, encodeBuilderDrafts, validateBuilderDraft, validateForCreate } from './state.ts'
import type { BuilderDraft } from './state.ts'
import type { BuilderRecipe } from './schema.ts'

function readDrafts() {
  try {
    return { drafts: decodeBuilderDrafts(localStorage.getItem(builderStorageKey), builderRecipes), warning: '' }
  } catch (error) {
    if (!(error instanceof SyntaxError || error instanceof TypeError || error instanceof RangeError ||
      (error instanceof DOMException && error.name === 'SecurityError'))) throw error
    return { drafts: {}, warning: `Saved builder drafts could not be loaded. ${error.message}` }
  }
}

export function useBuilderDrafts() {
  const [loaded] = useState(readDrafts)
  const [drafts, setDrafts] = useState<Record<string, BuilderDraft>>(loaded.drafts)
  const [storageEnabled, setStorageEnabled] = useState(!loaded.warning)
  const [warning, setWarning] = useState(loaded.warning)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!storageEnabled) return
    try {
      localStorage.setItem(builderStorageKey, encodeBuilderDrafts(drafts))
      // oxlint-disable-next-line react/set-state-in-effect -- Report the result of browser-storage synchronization.
      setWarning('')
    } catch (failure) {
      if (!(failure instanceof RangeError || (failure instanceof DOMException &&
        ['SecurityError', 'QuotaExceededError'].includes(failure.name)))) throw failure
      setWarning(`Drafts are available in this tab but could not be saved. ${failure.message}`)
    }
  }, [drafts, storageEnabled])

  function update(recipe: BuilderRecipe, next: BuilderDraft) {
    try {
      const valid = validateBuilderDraft(recipe, { ...next, updatedAt: new Date().toISOString() })
      setDrafts(current => ({ ...current, [recipe.id]: valid }))
      setError('')
      return true
    } catch (failure) {
      if (!(failure instanceof TypeError)) throw failure
      setError(failure.message)
      return false
    }
  }

  function open(recipe: BuilderRecipe, goal?: string) {
    setError('')
    if (drafts[recipe.id]) {
      if (goal?.trim()) return update(recipe, { ...drafts[recipe.id], status: 'draft', profile: { ...drafts[recipe.id].profile, description: goal.trim() } })
      return true
    }
    const next = createBuilderDraft(recipe)
    if (goal?.trim()) next.profile.description = goal.trim()
    return update(recipe, next)
  }

  function create(recipe: BuilderRecipe) {
    const draft = drafts[recipe.id]
    if (!draft) throw new Error('Open a recipe before creating a local agent.')
    const errors = validateForCreate(draft)
    if (errors.length) {
      setError(errors.join(' '))
      return false
    }
    return update(recipe, { ...draft, status: 'created' })
  }

  function reset(recipe?: BuilderRecipe) {
    setError('')
    if (recipe) {
      update(recipe, createBuilderDraft(recipe))
    } else {
      setDrafts({})
      setStorageEnabled(true)
      setWarning('')
    }
  }

  return { drafts, warning, error, open, update, create, reset, clearError: () => setError('') }
}
