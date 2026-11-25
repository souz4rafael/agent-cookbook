import { useEffect, useRef, useState } from 'react'
import { Checkmark20Regular } from '@fluentui/react-icons'
import type { MessageReaction } from '../domain/types.ts'
import { MessageActionIcon } from './MessageActionIcon.tsx'
import './MessageActions.css'

export function MessageActions({ text, reaction, onReact }: {
  text: string
  reaction?: MessageReaction
  onReact?: (value: MessageReaction) => void
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle')
  const [copyError, setCopyError] = useState('')
  const timer = useRef<number | null>(null)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [])

  async function copy() {
    if (timer.current !== null) window.clearTimeout(timer.current)
    setCopyError('')
    setCopyState('copying')
    try {
      if (!navigator.clipboard?.writeText) {
        setCopyState('error')
        setCopyError('Clipboard access is unavailable. Select the message text and copy it manually.')
        return
      }
      await navigator.clipboard.writeText(text)
      if (!mounted.current) return
      setCopyState('copied')
      timer.current = window.setTimeout(() => setCopyState('idle'), 2500)
    } catch (cause) {
      if (!(cause instanceof DOMException || cause instanceof TypeError)) throw cause
      if (!mounted.current) return
      setCopyState('error')
      setCopyError('The message could not be copied. Allow clipboard access or select the text and copy it manually.')
    }
  }

  return (
    <div className="message-actions-wrap">
      <div className="message-actions" role="group" aria-label="Message actions">
        <button className="message-action" type="button" aria-label="Copy message" title={copyState === 'copied' ? 'Copied' : 'Copy message'} disabled={copyState === 'copying'} onClick={() => { void copy() }}>
          {copyState === 'copied' ? <Checkmark20Regular aria-hidden="true" /> : <><MessageActionIcon name="copy" className="message-action-regular" /><MessageActionIcon name="copy" filled className="message-action-filled" /></>}
        </button>
        {onReact && <><button className="message-action" type="button" aria-label="Like" title="Like" aria-pressed={reaction === 'like'} onClick={() => onReact('like')}>
          <MessageActionIcon name="like" className="message-action-regular" /><MessageActionIcon name="like" filled className="message-action-filled" />
        </button>
        <button className="message-action" type="button" aria-label="Dislike" title="Dislike" aria-pressed={reaction === 'dislike'} onClick={() => onReact('dislike')}>
          <MessageActionIcon name="dislike" className="message-action-regular" /><MessageActionIcon name="dislike" filled className="message-action-filled" />
        </button></>}
        <span className="sr-only" role="status">{copyState === 'copied' ? 'Message copied to clipboard.' : ''}</span>
      </div>
      {copyError && <p className="message-copy-error" role="alert">{copyError}</p>}
    </div>
  )
}
