import assert from 'node:assert/strict'
import test from 'node:test'
import { cookbookHref, cookbookIds, cookbooks, collectionHomeHref } from '../src/collection/catalog.ts'

test('hub lists each cookbook exactly once with distinct product guidance', () => {
  assert.deepEqual(cookbooks.map(item => item.id), cookbookIds)
  assert.equal(new Set(cookbooks.map(item => item.product)).size, 3)
  for (const cookbook of cookbooks) {
    assert.ok(cookbook.description.length > 40)
    assert.ok(cookbook.experience.length > 40)
  }
})

test('collection navigation preserves the theme and works beneath a hosting prefix', () => {
  for (const base of ['https://example.invalid/', 'https://example.invalid/learn/']) {
    for (const theme of ['light', 'dark'] as const) {
      for (const id of cookbookIds) {
        const destination = new URL(cookbookHref(id, theme), `${base}index.html`)
        assert.equal(destination.href, `${base}${id}/index.html?scoutTheme=${theme}`)
        assert.equal(new URL(collectionHomeHref(theme), destination).href, `${base}index.html?scoutTheme=${theme}`)
      }
    }
  }
})
