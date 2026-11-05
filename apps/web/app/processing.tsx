"use client"
// GPay-style processing screen: the WhitePay mark draws itself inside a spinning gradient arc,
// one short line that changes per step, step dots, and a check burst when it's done.
import "./processing.css"

export function Processing({ title, steps, step, done = false, amount }: { title: string; steps: string[]; step: number; done?: boolean; amount?: string }) {
  return (
    <div className={`proc ${done ? "done" : ""}`} role="status" aria-live="polite" aria-label={done ? "Done" : steps[step]}>
      <div className="proc-mark">
        <svg className="proc-arc" viewBox="0 0 120 120" aria-hidden>
          <defs><linearGradient id="proc-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2448ff" /><stop offset="1" stopColor="#ddf05a" /></linearGradient></defs>
          <circle cx="60" cy="60" r="54" className="track" />
          <circle cx="60" cy="60" r="54" className="arc" />
        </svg>
        <div className="proc-logo" aria-hidden>
          {done ? (
            <svg viewBox="0 0 52 52" className="proc-check"><path d="M14 27l8 8 16-17" /></svg>
          ) : (
            <svg viewBox="0 0 512 512"><path d="M110 168l50 176 56-128 40 92 40-92 56 128 50-176" pathLength={1} /></svg>
          )}
        </div>
      </div>
      {amount && <div className="proc-amt">{amount}</div>}
      <div className="proc-title">{done ? "Done" : title}</div>
      <div className="proc-step" key={done ? "d" : step}>{done ? steps[steps.length - 1] : steps[step]}</div>
      <div className="proc-dots" aria-hidden>{steps.map((_, i) => <i key={i} className={i < step || done ? "on" : i === step ? "now" : ""} />)}</div>
    </div>
  )
}
