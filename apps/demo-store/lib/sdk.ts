// The exact SDK build this store pins (Subresource Integrity: the browser refuses a modified file).
export const WHITEPAY_URL = process.env.NEXT_PUBLIC_WHITEPAY_URL ?? "https://wondrpay.vercel.app"
export const SDK_SRC = `${WHITEPAY_URL}/sdk/v1.3.1/checkout.js`
export const SDK_SRI = "sha384-Cp+n+4w2CBEdJkp7hwtAPP7fZuwcvYW8VTE1xzHLjSCIOGAgVpIIalSrrQSjVUx1"
export const REPO = "https://github.com/AmrendraTheCoder/whitepay/blob/main/apps/demo-store"
