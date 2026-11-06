// The exact SDK build this store pins (Subresource Integrity: the browser refuses a modified file).
export const WHITEPAY_URL = process.env.NEXT_PUBLIC_WHITEPAY_URL ?? "https://wondrpay.vercel.app"
export const SDK_SRC = `${WHITEPAY_URL}/sdk/v1.4.0/checkout.js`
export const SDK_SRI = "sha384-3jD3JLkSDhHfnJk8Wf6YqdYoTLe0wNrIVShXyoF9IyImk0QErP0Sg7rhD9BcaR/s"
export const REPO = "https://github.com/AmrendraTheCoder/whitepay/blob/main/apps/demo-store"
