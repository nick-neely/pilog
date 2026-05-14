import * as React from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { HugeiconsIcon } from '@hugeicons/react'
import { Search01Icon } from '@hugeicons/core-free-icons'

import { cn } from '@renderer/lib/utils'
import { MODAL_CHROME_SCRIM_CLASS } from '@shared/window-chrome'

// Pilog's command palette is the keyboard-first discovery surface: search,
// filters, capture-from-anywhere. Styled to honour the Active-dialog role
// in DESIGN.md (rounded-xl, single ring, ambient shadow, no glass).

function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>): React.JSX.Element {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground',
        className
      )}
      {...props}
    />
  )
}

function CommandDialog({
  title = 'Command palette',
  description = 'Search notes, switch filters, and run actions.',
  open,
  onOpenChange,
  children
}: {
  title?: string
  description?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/*
          Tonal scrim, not glassmorphism. Matches alert-dialog's overlay so
          modals share an idiom across the app.
        */}
        <DialogPrimitive.Overlay
          data-slot="command-dialog-overlay"
          className={cn(
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
            MODAL_CHROME_SCRIM_CLASS
          )}
        />
        <DialogPrimitive.Content
          data-slot="command-dialog-content"
          className="fixed top-[18%] left-1/2 z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/5 outline-none duration-150 ease-[var(--ease-out-quart)] motion-reduce:duration-0 dark:ring-foreground/10 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          {/* a11y title/description; visually hidden but announced */}
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {description}
          </DialogPrimitive.Description>
          <Command className="bg-transparent [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground">
            {children}
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>): React.JSX.Element {
  return (
    <div
      data-slot="command-input-wrapper"
      className="flex items-center border-b border-border px-3"
    >
      <HugeiconsIcon
        icon={Search01Icon}
        className="mr-2 size-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          'flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      />
    </div>
  )
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>): React.JSX.Element {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn('max-h-80 scroll-py-1 overflow-x-hidden overflow-y-auto p-1', className)}
      {...props}
    />
  )
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>): React.JSX.Element {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn('py-6 text-center text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>): React.JSX.Element {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        'overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5',
        className
      )}
      {...props}
    />
  )
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>): React.JSX.Element {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  )
}

function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>): React.JSX.Element {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        // Active row uses Ash, not moss — moss stays reserved for primary
        // actions and focus. Selection feedback is tonal contrast.
        "relative flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none select-none data-[selected=true]:bg-muted data-[selected=true]:text-foreground data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function CommandShortcut({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>): React.JSX.Element {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        // Mono shortcut hints, paired with the editor body. Pencil tone so
        // the shortcut sits in the metadata register, not the action register.
        'tabular ml-auto font-mono text-xs tracking-tight text-muted-foreground',
        className
      )}
      {...props}
    />
  )
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator
}
