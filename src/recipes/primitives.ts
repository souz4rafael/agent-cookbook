import { z } from 'zod'

export const recipeIdSchema = z.string().min(1).max(64).regex(
  /^[a-z0-9]+(?:-[a-z0-9]+)*(?![\s\S])/, 'Use a lowercase, hyphen-separated identifier.',
)

// Keep fixture text inert while retaining ordinary tabs and line breaks.
// eslint-disable-next-line no-control-regex
const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/
const remoteUrl = /\b[a-z][a-z0-9+.-]*:\/\/|\b(?:mailto|javascript|data):|(?:^|[\s("'<>])\/\/[a-z0-9]|\bwww\./i
const credential = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:gh[pousr]_[a-z0-9]{20,}|github_pat_[a-z0-9_]{20,}|sk-[a-z0-9_-]{20,})|\b(?:api[_ -]?key|client[_ -]?secret|access[_ -]?token|password)\s*[:=]\s*["']?\S{8,}/i

export function recipeTextSchema(max: number, allowBlank = false) {
  return z.string().max(max)
    .refine(value => allowBlank || value.trim().length > 0, 'Text must not be blank.')
    .refine(value => !controls.test(value), 'Unsupported control characters in text.')
    .refine(value => !remoteUrl.test(value), 'Remote URLs and executable URL schemes are not allowed in local builder data.')
    .refine(value => !credential.test(value), 'Credential material is not allowed in local builder data.')
}
