'use client'

import { Button } from '@pilog/ui/button'
import { cn } from '@pilog/ui/utils'
import { useCallback, useEffect, useRef, useState } from 'react'

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  }
}

function DocsCopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current)
    }
  }, [])

  const handleCopy = useCallback(async () => {
    const ok = await copyText(value)
    if (!ok) return
    setCopied(true)
    if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current)
    resetTimerRef.current = setTimeout(() => setCopied(false), 2000)
  }, [value])

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground hover:text-foreground size-8 shrink-0 rounded-md"
      aria-label={copied ? 'Copied' : 'Copy to clipboard'}
      onClick={() => void handleCopy()}
    >
      {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
    </Button>
  )
}

function DocsCopyable({
  value,
  children,
  contentAlign = 'center'
}: {
  value: string
  children: React.ReactNode
  contentAlign?: 'center' | 'start'
}) {
  return (
    <div className="docs-copyable border-border/80 bg-secondary/35 my-2 flex overflow-hidden border-l-2 rounded-r-sm">
      <div
        className={cn(
          'min-w-0 flex-1 overflow-x-auto px-3',
          contentAlign === 'center' ? 'py-2' : 'py-3'
        )}
      >
        {children}
      </div>
      <div
        className={cn(
          'border-border/60 flex shrink-0 border-l px-1',
          contentAlign === 'center' ? 'items-center' : 'items-start pt-1.5'
        )}
      >
        <DocsCopyButton value={value} />
      </div>
    </div>
  )
}

/** One-line shell command with $ prompt and copy. */
export function DocsCommand({ children }: { children: string }) {
  return (
    <DocsCopyable value={children} contentAlign="center">
      <div className="flex items-baseline gap-2 font-mono text-[0.8125rem] leading-snug">
        <span className="text-muted-foreground shrink-0 text-xs select-none">$</span>
        <code className="text-foreground">{children}</code>
      </div>
    </DocsCopyable>
  )
}

/** Multi-line code or config block with copy. */
export function DocsCodeBlock({ children }: { children: string }) {
  return (
    <DocsCopyable value={children} contentAlign="start">
      <pre className="text-foreground/90 font-mono text-[0.8rem] leading-relaxed whitespace-pre">
        <code>{children}</code>
      </pre>
    </DocsCopyable>
  )
}
