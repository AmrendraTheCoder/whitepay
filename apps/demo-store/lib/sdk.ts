// The exact SDK build this store pins (Subresource Integrity: the browser refuses a modified file).
export const WHITEPAY_URL = process.env.NEXT_PUBLIC_WHITEPAY_URL ?? "https://wondrpay.vercel.app"
export const SDK_SRC = `${WHITEPAY_URL}/sdk/v1.3.0/checkout.js`
export const SDK_SRI = "sha384-0EZPRTTTjn+z90N4KNq1JDS7yT/PyJk/Jl9nsS98UGzr+1mXNBUN/nC3KN1aB8Vl"
export const REPO = "https://github.com/AmrendraTheCoder/whitepay/blob/main/apps/demo-store"
