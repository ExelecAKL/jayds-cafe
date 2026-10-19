"use client";
// apps/admin/components/CommandPalette.tsx
// Ctrl/⌘ + K quick jump: find any Admin page or common filtered view by name.
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { announceNavigation } from "@cafeos/shared/ui/route-progress";
import { adminNavItems } from "./adminNav";
import { Icon, type IconName } from "./Operations";

type Entry = {
  href: string;
  label: string;
  group: string;
  icon: IconName;
  keywords?: string;
};

const shortcuts: Entry[] = [
  {
    href: "/inventory?filter=low",
    label: "Low and unavailable stock",
    group: "Shortcuts",
    icon: "alert",
    keywords: "reorder running out",
  },
  {
    href: "/orders?filter=stock_conflict",
    label: "Orders blocked by stock",
    group: "Shortcuts",
    icon: "orders",
    keywords: "conflict reservation",
  },
  {
    href: "/purchasing?filter=draft",
    label: "Purchase drafts to review",
    group: "Shortcuts",
    icon: "purchase",
    keywords: "approve supplier",
  },
  {
    href: "/purchasing?filter=incoming",
    label: "Incoming deliveries",
    group: "Shortcuts",
    icon: "stock",
    keywords: "receive arriving",
  },
  {
    href: "/inventory?filter=expiry",
    label: "Batches expiring soon",
    group: "Shortcuts",
    icon: "calendar",
    keywords: "expiry spoil",
  },
];

const entries: Entry[] = [...adminNavItems, ...shortcuts];

const RECENT_KEY = "jayds-admin-recent-pages:v1";
const RECENT_LIMIT = 4;
function readRecent(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}
/** Remember the pages an admin actually opens, newest first. */
export function rememberRecentPage(pathname: string) {
  const entry = adminNavItems.find((item) => item.href === pathname);
  if (!entry) return;
  try {
    const next = [pathname, ...readRecent().filter((href) => href !== pathname)];
    window.localStorage.setItem(
      RECENT_KEY,
      JSON.stringify(next.slice(0, RECENT_LIMIT + 1)),
    );
  } catch {
    // Without storage the palette simply has no recent section.
  }
}

function score(entry: Entry, query: string) {
  if (!query) return 1;
  const label = entry.label.toLowerCase();
  const haystack = `${label} ${entry.group} ${entry.keywords ?? ""}`.toLowerCase();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.every((word) => haystack.includes(word))) return 0;
  return label.startsWith(words[0]) ? 3 : label.includes(words[0]) ? 2 : 1;
}

export function useCommandPaletteShortcut(onOpen: () => void) {
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpen();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [onOpen]);
}

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [recent] = useState(() =>
    typeof window === "undefined" ? [] : readRecent(),
  );
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const results = useMemo(() => {
    const trimmed = query.trim();
    const ranked = entries
      .map((entry) => ({ entry, rank: score(entry, trimmed) }))
      .filter((result) => result.rank > 0)
      .sort((a, b) => b.rank - a.rank)
      .map((result) => result.entry);
    if (trimmed) return ranked;
    // With no query, the pages opened most recently come first.
    const recents = recent
      .filter((href) => href !== pathname)
      .slice(0, RECENT_LIMIT)
      .map((href) => adminNavItems.find((item) => item.href === href))
      .filter((item): item is (typeof adminNavItems)[number] => Boolean(item))
      .map((item) => ({ ...item, group: "Recent" }));
    const recentHrefs = new Set(recents.map((item) => item.href));
    return [
      ...recents,
      ...ranked.filter((entry) => !recentHrefs.has(entry.href)),
    ];
  }, [pathname, query, recent]);
  const selected = Math.min(active, Math.max(results.length - 1, 0));

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    input.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const go = (entry: Entry | undefined) => {
    if (!entry) return;
    onClose();
    announceNavigation(entry.href);
    router.push(entry.href);
  };

  return (
    <div className="ops-palette-overlay" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Jump to a page"
        className="ops-palette"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((selected + 1) % Math.max(results.length, 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive(
              (selected - 1 + results.length) % Math.max(results.length, 1),
            );
          } else if (event.key === "Enter") {
            event.preventDefault();
            go(results[selected]);
          } else if (event.key === "Tab") {
            // Keep focus on the search field; arrows move through results.
            event.preventDefault();
          }
        }}
      >
        <div className="ops-palette-search">
          <Icon name="search" />
          <input
            ref={input}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            placeholder="Jump to a page or task…"
            aria-label="Search Admin pages"
            role="combobox"
            aria-expanded="true"
            aria-controls="ops-palette-results"
            aria-activedescendant={
              results[selected] ? `ops-palette-${selected}` : undefined
            }
          />
          <kbd>Esc</kbd>
        </div>
        <ul
          ref={list}
          id="ops-palette-results"
          role="listbox"
          aria-label="Matching pages"
          className="ops-palette-results"
        >
          {results.map((entry, index) => (
            <li
              key={`${entry.group}:${entry.href}`}
              id={`ops-palette-${index}`}
              data-index={index}
              role="option"
              aria-selected={index === selected}
              className={index === selected ? "active" : ""}
              onMouseMove={() => setActive(index)}
              onClick={() => go(entry)}
            >
              <span className="ops-palette-icon">
                <Icon name={entry.icon} size={16} />
              </span>
              <span className="ops-palette-label">{entry.label}</span>
              <small>{entry.group}</small>
            </li>
          ))}
          {!results.length && (
            <li className="ops-palette-empty" role="presentation">
              No page matches “{query}”.
            </li>
          )}
        </ul>
        <footer className="ops-palette-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> to move
          </span>
          <span>
            <kbd>Enter</kbd> to open
          </span>
          <span className="ops-palette-tips">
            <kbd>Shift</kbd>
            <kbd>N</kbd> notifications · <kbd>?</kbd> help · <kbd>/</kbd> search
          </span>
        </footer>
      </div>
    </div>
  );
}
