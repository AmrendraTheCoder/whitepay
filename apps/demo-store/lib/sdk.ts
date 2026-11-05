// The exact SDK build this store pins (Subresource Integrity: the browser refuses a modified file).
export const WHITEPAY_URL = process.env.NEXT_PUBLIC_WHITEPAY_URL ?? "https://whitepay.vercel.app"
export const SDK_SRC = `${WHITEPAY_URL}/sdk/v1.2.0/checkout.js`
export const SDK_SRI = "sha384-G91uhMh4/DJR2Qp+0XuKBAtG5q59VWMLwQawh6ueK6CJStJrSwJAEKgb/kLelr02"
export const REPO = "https://github.com/AmrendraTheCoder/whitepay/blob/main/apps/demo-store"
