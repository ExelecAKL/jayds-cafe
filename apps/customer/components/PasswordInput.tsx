"use client";
import { PasswordInput as SharedPasswordInput } from "@cafeos/shared/ui/password-input";
import type { ComponentProps } from "react";
export default function PasswordInput(
  props: ComponentProps<typeof SharedPasswordInput>,
) {
  return (
    <SharedPasswordInput
      {...props}
      className={
        props.className ??
        "w-full rounded-2xl border border-border bg-bg-input py-3 pl-4 text-sm text-text-primary placeholder:text-text-faint"
      }
    />
  );
}
