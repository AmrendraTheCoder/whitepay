"use client"
// Quantity stepper: two labelled buttons and an <output>, clamped to [min, max].
import { Icon } from "./Icon"

export type QuantityStepperProps = {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  /** What is being counted, used in the accessible labels: "Masala Chai Kit" → "Decrease Masala Chai Kit quantity" */
  label: string
  size?: "sm" | "md"
}
export function QuantityStepper({ value, onChange, min = 0, max = 10, label, size = "md" }: QuantityStepperProps) {
  const set = (n: number) => onChange(Math.max(min, Math.min(max, n)))
  return (
    <div className="wp-stepper" role="group" aria-label={`${label} quantity`} style={size === "sm" ? { height: 32 } : undefined}>
      <button type="button" onClick={() => set(value - 1)} disabled={value <= min} aria-label={value - 1 < 1 && min === 0 ? `Remove ${label}` : `Decrease ${label} quantity`}><Icon name="minus" size={16} /></button>
      <output aria-live="polite">{value}</output>
      <button type="button" onClick={() => set(value + 1)} disabled={value >= max} aria-label={`Increase ${label} quantity`}><Icon name="plus" size={16} /></button>
    </div>
  )
}
