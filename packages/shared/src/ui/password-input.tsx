"use client";
import { useId, useState, type InputHTMLAttributes } from "react";
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  secretName?: string;
};
/** One field, with a separate visibility action that never submits its form. */
export function PasswordInput({
  id,
  secretName = "password",
  disabled,
  onChange,
  style,
  ...props
}: Props) {
  const fallbackId = useId(),
    inputId = id ?? fallbackId;
  const [visible, setVisible] = useState(false);
  const revealed = visible && !disabled;
  return (
    <span
      data-password-field
      style={{ display: "block", position: "relative", width: "100%" }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setVisible(false);
      }}
    >
      <input
        {...props}
        id={inputId}
        type={revealed ? "text" : "password"}
        disabled={disabled}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        style={{
          ...style,
          width: "100%",
          boxSizing: "border-box",
          minHeight: 48,
          paddingRight: 88,
        }}
        onChange={(event) => {
          if (!event.target.value) setVisible(false);
          onChange?.(event);
        }}
      />
      <button
        type="button"
        aria-label={`${revealed ? "Hide" : "Show"} ${secretName}`}
        aria-controls={inputId}
        aria-pressed={revealed}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.preventDefault();
          setVisible((value) => !value);
        }}
        style={{
          position: "absolute",
          right: 4,
          top: "50%",
          transform: "translateY(-50%)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 5,
          minWidth: 76,
          minHeight: 44,
          padding: "8px 6px",
          border: 0,
          borderRadius: 8,
          background: "transparent",
          color: "inherit",
          fontSize: 12,
          fontWeight: 600,
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {revealed && <path d="m3 3 18 18" />}
        </svg>
        <span>{revealed ? "Hide" : "Show"}</span>
      </button>
    </span>
  );
}
