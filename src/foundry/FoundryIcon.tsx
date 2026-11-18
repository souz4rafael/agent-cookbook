// Reference-pinned Fluent glyphs: these two shapes differ in the installed icon release.
// Copyright (c) Microsoft Corporation. MIT; see assets/NOTICE.txt.
const paths = {
  copy: 'M8 2a2 2 0 0 0-2 2v10c0 1.1.9 2 2 2h6a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8ZM7 4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4ZM4 6a2 2 0 0 1 1-1.73V14.5A2.5 2.5 0 0 0 7.5 17h6.23A2 2 0 0 1 12 18H7.5A3.5 3.5 0 0 1 4 14.5V6Z',
  feedback: 'M13.5 8.5a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm-5 0a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm-.03 4.55a.5.5 0 1 0-.44.9c.58.29 1.28.43 1.97.43s1.39-.14 1.97-.43a.5.5 0 1 0-.44-.9c-.42.21-.97.32-1.53.32a3.5 3.5 0 0 1-1.53-.32ZM18 10a8 8 0 1 0-16 0 8 8 0 0 0 16 0ZM3 10a7 7 0 1 1 14 0 7 7 0 0 1-14 0Z',
}

export function FoundryIcon({ name }: { name: keyof typeof paths }) {
  return <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>
}
