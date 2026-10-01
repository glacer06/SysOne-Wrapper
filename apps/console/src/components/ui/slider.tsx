"use client";

import { type InputHTMLAttributes, useId } from "react";

import { cx } from "./cx";

export interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> {
  label: string;
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** How the value reads next to the label, for example 0.85. */
  format?: (value: number) => string;
}

/** A native range input: arrow keys, Page Up and Down, and Home and End all work. */
export function Slider({ label, value, onValueChange, min = 0, max = 1, step = 0.01, format = (v) => v.toFixed(2), className, id: givenId, ...rest }: SliderProps) {
  const autoId = useId();
  const id = givenId ?? autoId;
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-bw-text">
          {label}
        </label>
        <output htmlFor={id} className="font-mono text-sm tabular-nums text-bw-text">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onValueChange(Number(e.target.value))}
        aria-valuetext={format(value)}
        className="h-6 w-full cursor-pointer accent-bw-brand"
        {...rest}
      />
    </div>
  );
}
