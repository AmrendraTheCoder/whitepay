// 3) listen for the result (UI only; the shop's server fulfils from the signed webhook + on-chain check)
document.addEventListener("wondrpay:paid", (e) => {
  const out = document.getElementById("result")
  out.textContent = `Paid ${(Number(e.detail.amount) / 1e6).toFixed(2)} USDT ✓ `
  if (e.detail.explorer) {
    const a = Object.assign(document.createElement("a"), { href: e.detail.explorer, target: "_blank", rel: "noopener noreferrer", textContent: "View on Whitechain ↗" })
    out.append(a)
  }
})
document.addEventListener("wondrpay:error", (e) => { document.getElementById("result").textContent = `Error: ${e.detail.message}` })
