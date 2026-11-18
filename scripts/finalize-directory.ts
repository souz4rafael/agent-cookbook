import { rename } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'

export async function finalizeDirectory(source: string, destination: string) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(source, destination)
      return
    } catch (error) {
      // Windows sync/indexing can briefly hold newly written directory trees.
      if (process.platform !== 'win32' || !(error instanceof Error) ||
          !('code' in error) || !['EPERM', 'EBUSY'].includes(String(error.code)) || attempt >= 4) throw error
      await setTimeout(100 * 2 ** attempt)
    }
  }
}
