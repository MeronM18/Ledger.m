"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { NavLinks } from "@/components/sidebar";
import { SignOutButton } from "@/components/sign-out-button";

/**
 * Phone navigation: a slim top bar with a menu button that opens the same
 * links as the desktop sidebar in a left drawer. Built on the Radix dialog,
 * so it traps focus, closes on Escape, and labels itself for screen readers.
 * Choosing a link closes it.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden">
      <span className="font-serif text-lg font-bold tracking-tight text-champagne">Ledger.m</span>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Trigger
          aria-label="Open menu"
          className="inline-flex size-9 items-center justify-center rounded-md text-bone transition-colors hover:bg-muted"
        >
          <Menu className="size-5" aria-hidden />
        </DialogPrimitive.Trigger>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 flex w-64 max-w-[80vw] flex-col border-r border-border bg-background p-4 outline-none duration-150 data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left"
          >
            <div className="mb-6 flex items-center justify-between px-2">
              <DialogPrimitive.Title className="font-serif text-lg font-bold tracking-tight text-champagne">
                Ledger.m
              </DialogPrimitive.Title>
              <DialogPrimitive.Close
                aria-label="Close menu"
                className="inline-flex size-8 items-center justify-center rounded-md text-ash-grey transition-colors hover:bg-muted hover:text-bone"
              >
                <X className="size-4" aria-hidden />
              </DialogPrimitive.Close>
            </div>
            <NavLinks onNavigate={() => setOpen(false)} />
            <div className="mt-auto border-t border-border pt-2">
              <SignOutButton />
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </header>
  );
}
