"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

// Dark-only app, no theme provider/toggle — force sonner's own dark
// defaults rather than reading next-themes (which has no provider wired up
// and would otherwise fall back to "system").
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          // Sage/brick, not sonner's default green/red — same money-signal
          // colors carry "this worked" / "this failed" too.
          "--success-bg": "var(--popover)",
          "--success-border": "var(--muted-sage)",
          "--success-text": "var(--muted-sage)",
          "--error-bg": "var(--popover)",
          "--error-border": "var(--muted-brick)",
          "--error-text": "var(--muted-brick)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
