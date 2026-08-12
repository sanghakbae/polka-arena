import type { ReactNode } from "react"

/// Renders a link when the chain has an explorer, and plain text when it does not
/// (a local dev node), so nothing on screen is a dead link.
export function ExplorerLink({ href, children }: { href: string | undefined; children: ReactNode }) {
  if (!href) return <span>{children}</span>
  return (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  )
}
