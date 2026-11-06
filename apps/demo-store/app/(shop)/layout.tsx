import { Suspense } from "react"
import { StoreProvider } from "../store-context"
import { Footer, Header } from "./shell"
import "./kesar.css"

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <div className="ks">
        <Suspense fallback={<div className="ks-header" />}><Header /></Suspense>
        <main id="main">{children}</main>
        <Footer />
      </div>
    </StoreProvider>
  )
}
