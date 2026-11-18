import { useState } from 'react'
import { foundryRecipes } from './catalog.ts'
import { createFoundryDraft, decodeFoundryDrafts, encodeFoundryDrafts, foundryDraftStorageKey, validateFoundryDraft, validateFoundryName } from './state.ts'
import type { FoundryDraft } from './state.ts'
import type { FoundryRecipe } from './schema.ts'

function isStorageError(error: unknown): error is Error {
  return error instanceof SyntaxError || error instanceof TypeError || error instanceof RangeError ||
    (error instanceof DOMException && ['SecurityError', 'QuotaExceededError'].includes(error.name))
}

function readSaved() {
  try {
    const raw = localStorage.getItem(foundryDraftStorageKey)
    return { drafts: decodeFoundryDrafts(raw, foundryRecipes), raw, warning: '' }
  } catch (error) {
    if (!isStorageError(error)) throw error
    return { drafts: [], raw: null, warning: `Local drafts could not be loaded. ${error.message} Existing stored data has not been changed.` }
  }
}

export function useFoundryDrafts() {
  const [loaded] = useState(readSaved)
  const [drafts, setDrafts] = useState(loaded.drafts)
  const [raw, setRaw] = useState(loaded.raw)
  const [warning, setWarning] = useState(loaded.warning)

  function persist(next: FoundryDraft[]) {
    if (warning) throw new TypeError('Local saving is unavailable. Resolve the saved-data issue and reload before creating or editing a draft.')
    try {
      if (localStorage.getItem(foundryDraftStorageKey) !== raw) {
        throw new TypeError('Foundry drafts changed in another tab. Reload this page before saving to avoid overwriting them.')
      }
      const encoded = encodeFoundryDrafts(next, foundryRecipes)
      localStorage.setItem(foundryDraftStorageKey, encoded)
      setRaw(encoded)
      setDrafts(next)
    } catch (error) {
      if (!isStorageError(error)) throw error
      setWarning(`Local drafts could not be saved. ${error.message} Your previously saved drafts have not been replaced.`)
      throw error
    }
  }

  function create(recipe: FoundryRecipe, name: string) {
    const draft = createFoundryDraft(recipe, name, drafts)
    persist([...drafts, draft])
    return draft
  }

  function save(recipe: FoundryRecipe, edited: FoundryDraft) {
    const previous = drafts.find(draft => draft.id === edited.id)
    if (!previous) throw new TypeError('That local draft is no longer available.')
    const nameError = validateFoundryName(edited.name, drafts, edited.id)
    if (nameError) throw new TypeError(nameError)
    const valid = validateFoundryDraft(recipe, { ...edited, createdAt: previous.createdAt, updatedAt: new Date().toISOString() })
    persist(drafts.map(draft => draft.id === valid.id ? valid : draft))
    return valid
  }

  return { drafts, warning, create, save }
}
