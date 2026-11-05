// The exact SDK build this store pins (Subresource Integrity: the browser refuses a modified file).
export const WHITEPAY_URL = process.env.NEXT_PUBLIC_WHITEPAY_URL ?? "https://whitepay.vercel.app"
export const SDK_SRC = `${WHITEPAY_URL}/sdk/v1.2.1/checkout.js`
export const SDK_SRI = "sha384-mYqN+5ZK/kC03JCTRK5Izc2hJQ5p5vbImdK8RYS8X7Gpj3OUG90OdBzuiHvwdF6g"
export const REPO = "https://github.com/AmrendraTheCoder/whitepay/blob/main/apps/demo-store"
