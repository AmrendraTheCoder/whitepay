"use client"
import { ToastProvider } from "@whitepay/ui"
export const Providers = ({ children }: { children: React.ReactNode }) => <ToastProvider>{children}</ToastProvider>
