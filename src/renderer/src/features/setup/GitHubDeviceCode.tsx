import { Copy01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@renderer/components/ui/button'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot
} from '@renderer/components/ui/input-otp'
import { cn } from '@renderer/lib/utils'
import type { GitHubAuthProgress } from '@shared/ipc'
import { useMemo, useState } from 'react'
import { REGEXP_ONLY_DIGITS_AND_CHARS } from 'input-otp'

type GitHubDeviceCodeProps = {
  auth: Extract<GitHubAuthProgress, { state: 'device_code' }>
  className?: string
  align?: 'center' | 'start'
  message?: string
}

export function GitHubDeviceCode({
  auth,
  className,
  align = 'center',
  message = 'GitHub is open in your browser. Enter this code there to approve Pilog.'
}: GitHubDeviceCodeProps): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const compactCode = useMemo(() => auth.userCode.replace(/[^a-zA-Z0-9]/g, ''), [auth.userCode])
  const firstGroup = compactCode.slice(0, 4)
  const secondGroup = compactCode.slice(4)

  const handleCopy = async (): Promise<void> => {
    await navigator.clipboard.writeText(auth.userCode)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-md border bg-muted/30 p-4',
        align === 'center' ? 'items-center text-center' : 'items-start text-left',
        className
      )}
      aria-live="polite"
    >
      <div
        className={cn('flex flex-col gap-1', align === 'center' ? 'items-center' : 'items-start')}
      >
        <p className="text-sm font-medium text-foreground">Enter this GitHub code</p>
        <p className="max-w-[42ch] text-xs leading-5 text-muted-foreground">{message}</p>
      </div>

      <InputOTP
        value={compactCode}
        maxLength={compactCode.length}
        pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
        readOnly
        aria-label={`GitHub device code ${auth.userCode}`}
        containerClassName="justify-center"
      >
        <InputOTPGroup>
          {firstGroup.split('').map((_, index) => (
            <InputOTPSlot key={index} index={index} className="font-mono text-sm" />
          ))}
        </InputOTPGroup>
        {secondGroup ? (
          <>
            <InputOTPSeparator />
            <InputOTPGroup>
              {secondGroup.split('').map((_, index) => (
                <InputOTPSlot
                  key={index + firstGroup.length}
                  index={index + firstGroup.length}
                  className="font-mono text-sm"
                />
              ))}
            </InputOTPGroup>
          </>
        ) : null}
      </InputOTP>

      <div
        className={cn(
          'flex flex-wrap items-center gap-2',
          align === 'center' ? 'justify-center' : 'justify-start'
        )}
      >
        <Button type="button" variant="outline" size="sm" onClick={() => void handleCopy()}>
          <HugeiconsIcon icon={Copy01Icon} data-icon="inline-start" aria-hidden />
          {copied ? 'Copied' : 'Copy code'}
        </Button>
        <span className="text-xs text-muted-foreground">{auth.verificationUri}</span>
      </div>
    </div>
  )
}
