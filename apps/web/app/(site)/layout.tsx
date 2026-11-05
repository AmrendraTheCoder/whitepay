import "@whitepay/ui/styles.css"
import "./site.css"
import { SiteHeader, SiteFooter } from "./site-chrome"
import { StandaloneRedirect } from "./open-app"

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site" data-theme="ink">
      <StandaloneRedirect />
      <a href="#main" className="wp-skip">Skip to content</a>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </div>
  )
}
