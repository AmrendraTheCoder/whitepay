import { SiteHeader, SiteFooter } from "./site-chrome"
import { StandaloneRedirect } from "./open-app"
import "./site.css"

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site">
      <StandaloneRedirect />
      <a href="#main" className="s-skip">Skip to content</a>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </div>
  )
}
