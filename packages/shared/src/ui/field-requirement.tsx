/** Visible form guidance. Validation stays with the field and its submit handler. */
export function FieldRequirement({ required }: { required: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-field-requirement={required ? "required" : "optional"}
      title={required ? "Required" : "Optional"}
      style={{
        marginInlineStart: "0.3em",
        color: required ? "#b91c1c" : "inherit",
        fontWeight: required ? 700 : 400,
        textTransform: "none",
        letterSpacing: "normal",
        whiteSpace: "nowrap",
      }}
    >
      {required ? "*" : "(optional)"}
    </span>
  );
}
