"use client";
import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Operations";

type Option = {
  value: string;
  label: string;
  disabled: boolean;
  group?: string;
};
function text(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) =>
      isValidElement<{ children?: ReactNode }>(child)
        ? text(child.props.children)
        : String(child),
    )
    .join("");
}
function optionsFrom(
  children: ReactNode,
  group?: string,
  groupDisabled = false,
): Option[] {
  return Children.toArray(children).flatMap((child) => {
    if (
      !isValidElement<{
        value?: string | number;
        disabled?: boolean;
        label?: string;
        children?: ReactNode;
      }>(child)
    )
      return [];
    if (child.type === Fragment)
      return optionsFrom(child.props.children, group, groupDisabled);
    if (child.type === "optgroup")
      return optionsFrom(
        child.props.children,
        child.props.label,
        Boolean(child.props.disabled),
      );
    if (child.type !== "option") return [];
    const label = child.props.label ?? text(child.props.children);
    return [
      {
        value: String(child.props.value ?? label),
        label,
        disabled: groupDisabled || Boolean(child.props.disabled),
        group,
      },
    ];
  });
}
type Props = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "multiple" | "size" | "onKeyDown" | "onBlur" | "onFocus"
>;

// Preserves the value/onChange contract of existing forms while providing one
// themed, keyboard-operable listbox throughout Admin.
export function AdminSelect({
  children,
  value,
  defaultValue,
  onChange,
  className = "",
  disabled,
  required,
  name,
  id,
  title,
  style,
  ...attributes
}: Props) {
  const generated = useId();
  const controlId = id ?? `admin-select-${generated}`;
  const listId = `${controlId}-options`;
  const options = optionsFrom(children);
  const [localValue, setLocalValue] = useState(
    String(defaultValue ?? options[0]?.value ?? ""),
  );
  const current = String(value ?? localValue);
  const selected = options.findIndex((option) => option.value === current);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [invalid, setInvalid] = useState(false);
  const [position, setPosition] = useState({
    left: 0,
    top: 0,
    width: 0,
    maxHeight: 280,
  });
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const typeahead = useRef({ text: "", time: 0 });
  const enabled = options
    .map((option, index) => (option.disabled ? -1 : index))
    .filter((index) => index >= 0);
  const accessibleAttributes = Object.fromEntries(
    Object.entries(attributes).filter(
      ([key]) =>
        key.startsWith("aria-") ||
        key.startsWith("data-") ||
        key === "tabIndex" ||
        key === "form",
    ),
  );
  const choose = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    setLocalValue(option.value);
    setInvalid(false);
    setOpen(false);
    onChange?.({
      target: { value: option.value, name },
      currentTarget: { value: option.value, name },
    } as ChangeEvent<HTMLSelectElement>);
    trigger.current?.focus();
  };
  const show = () => {
    if (disabled || !enabled.length) return;
    setPortalTarget(
      trigger.current?.closest('[role="dialog"],[role="alertdialog"]') ??
        document.body,
    );
    const rect = trigger.current!.getBoundingClientRect();
    const gap = 6;
    const roomBelow = window.innerHeight - rect.bottom - gap * 2;
    const height = Math.min(280, options.length * 44 + 16);
    const above = roomBelow < Math.min(height, 160) && rect.top > roomBelow;
    const available = Math.max(88, above ? rect.top - gap * 2 : roomBelow);
    const width = Math.min(
      Math.max(rect.width, 180),
      window.innerWidth - gap * 2,
    );
    setPosition({
      left: Math.max(gap, Math.min(rect.left, window.innerWidth - width - gap)),
      top: above
        ? rect.top - Math.min(height, available) - gap
        : rect.bottom + gap,
      width,
      maxHeight: Math.min(height, available),
    });
    setActive(
      selected >= 0 && !options[selected].disabled
        ? selected
        : (enabled[0] ?? 0),
    );
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        !trigger.current?.contains(event.target as Node) &&
        !popup.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const reposition = (event: Event) => {
      if (!popup.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", reposition);
    document.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("scroll", reposition, true);
    };
  }, [open]);
  useEffect(() => {
    if (open)
      popup.current
        ?.querySelector(`[data-option-index="${active}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  return (
    <span className={`admin-select ${disabled ? "is-disabled" : ""}`}>
      <button
        {...accessibleAttributes}
        id={controlId}
        data-value={current}
        ref={trigger}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-required={required || undefined}
        aria-invalid={invalid || attributes["aria-invalid"]}
        aria-describedby={
          invalid ? `${controlId}-error` : attributes["aria-describedby"]
        }
        title={title}
        disabled={disabled}
        style={style}
        className={`admin-select-trigger ${className}`}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            return;
          }
          if (event.key === "Tab") {
            setOpen(false);
            return;
          }
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            if (!open) {
              show();
              if (event.key === "Home") setActive(enabled[0] ?? 0);
              else if (event.key === "End") setActive(enabled.at(-1) ?? 0);
              return;
            }
            const at = enabled.indexOf(active);
            setActive(
              event.key === "Home"
                ? enabled[0]
                : event.key === "End"
                  ? enabled.at(-1)!
                  : (enabled[
                      (at +
                        (event.key === "ArrowUp" ? -1 : 1) +
                        enabled.length) %
                        enabled.length
                    ] ?? 0),
            );
          } else if ((event.key === "Enter" || event.key === " ") && open) {
            event.preventDefault();
            choose(active);
          } else if (
            event.key.length === 1 &&
            event.key !== " " &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey
          ) {
            event.preventDefault();
            const now = Date.now();
            const character = event.key.toLowerCase();
            const repeating =
              typeahead.current.text === character &&
              now - typeahead.current.time < 700;
            const query = repeating
              ? character
              : now - typeahead.current.time < 700
                ? typeahead.current.text + character
                : character;
            typeahead.current = { text: query.toLowerCase(), time: now };
            const start = enabled.indexOf(open ? active : selected);
            const order = repeating
              ? [...enabled.slice(start + 1), ...enabled.slice(0, start + 1)]
              : enabled;
            const match = order.find((index) =>
              options[index].label
                .toLowerCase()
                .startsWith(query.toLowerCase()),
            );
            if (match !== undefined) {
              if (open) setActive(match);
              else choose(match);
            }
          }
        }}
      >
        <span>{options[selected]?.label || "Choose an option"}</span>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path d="m6 8 4 4 4-4" />
        </svg>
      </button>
      {name && (
        <input type="hidden" name={name} value={current} disabled={disabled} />
      )}
      {required && !disabled && (
        <input
          className="admin-select-validation"
          tabIndex={-1}
          aria-hidden="true"
          value={current}
          required
          onChange={() => {}}
          onInvalid={(event) => {
            event.preventDefault();
            setInvalid(true);
            trigger.current?.focus();
          }}
        />
      )}
      {invalid && (
        <span
          className="admin-select-error"
          id={`${controlId}-error`}
          role="alert"
        >
          Choose an option.
        </span>
      )}
      {open &&
        portalTarget &&
        createPortal(
          <div
            ref={popup}
            className="admin-select-popup"
            id={listId}
            role="listbox"
            aria-label={attributes["aria-label"] ?? "Options"}
            style={{
              left: position.left,
              top: position.top,
              width: position.width,
              maxHeight: position.maxHeight,
            }}
          >
            {options.map((option, index) => (
              <div
                id={`${listId}-${index}`}
                key={`${option.value}-${index}`}
                data-option-index={index}
                data-value={option.value}
                role="option"
                aria-selected={current === option.value}
                aria-disabled={option.disabled || undefined}
                className={`admin-select-option ${active === index ? "is-active" : ""}`}
                onPointerDown={(event) => event.preventDefault()}
                onPointerMove={() => {
                  if (!option.disabled) setActive(index);
                }}
                onClick={() => choose(index)}
              >
                <span>
                  {option.group && <small>{option.group}</small>}
                  {option.label}
                </span>
                {current === option.value && <Icon name="check" size={16} />}
              </div>
            ))}
          </div>,
          portalTarget,
        )}
    </span>
  );
}
