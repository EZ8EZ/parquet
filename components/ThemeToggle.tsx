"use client";

/**
 * The theme control. Three explicit choices, never a cycle button: a cycle gives no way
 * to see what is selected or to jump straight to the one you want, which is a poor deal
 * for a control whose whole purpose is accessibility.
 *
 * The `<html>` attribute is the source of truth, not a copy of it in component state.
 * The boot script in <head> (lib/theme.ts) has already resolved the preference and
 * written it there before this component exists, so subscribing to that element via
 * `useSyncExternalStore` means there is no second copy that can disagree - and it picks
 * up a change made by anything else, including another instance of this control.
 */

import { useSyncExternalStore } from "react";
import { Check, Contrast, Moon, Sun } from "lucide-react";
import {
  DEFAULT_THEME,
  THEME_ATTRIBUTE,
  THEME_CHROME,
  THEME_META,
  THEME_STORAGE_KEY,
  parseTheme,
  type Theme,
} from "@/lib/theme";

const ICON: Record<Theme, typeof Moon> = {
  dark: Moon,
  light: Sun,
  contrast: Contrast,
};

/** Re-read whenever anything writes the attribute, including the boot script. */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [THEME_ATTRIBUTE],
  });
  return () => observer.disconnect();
}

function getSnapshot(): Theme {
  return parseTheme(document.documentElement.getAttribute(THEME_ATTRIBUTE));
}

/** The server cannot know this browser's choice, so it renders the committed default. */
function getServerSnapshot(): Theme {
  return DEFAULT_THEME;
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const choose = (next: Theme) => {
    // Writing the attribute is what changes the theme; the observer above turns that
    // into the re-render, so there is exactly one path and no state to keep in step.
    document.documentElement.setAttribute(THEME_ATTRIBUTE, next);
    // The address bar is the one themed surface CSS cannot reach - same map the
    // boot script uses, so the chrome can never disagree with the page.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", THEME_CHROME[next]);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private-mode Safari throws on write. The theme still applies for this visit;
      // it just will not survive a reload, which is better than not applying at all.
    }
  };

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Theme"
        className="grid grid-cols-3 gap-1.5"
      >
        {THEME_META.map((t) => {
          const Icon = ICON[t.id];
          const active = theme === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={active}
              data-theme-choice={t.id}
              onClick={() => choose(t.id)}
              // The selected look (accent ring, wash, check) is applied by CSS off
              // the root [data-theme] attribute (globals.css), NOT by these classes:
              // a React-rendered ring can trail the theme repaint by the length of
              // the full-document style recalc the switch triggers. See globals.css.
              className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-[--radius-sm] border border-border bg-surface/60 px-2 py-2 text-[11px] font-semibold text-muted transition-colors hover:border-border-strong hover:text-ink motion-reduce:transition-none"
            >
              <span className="flex items-center gap-1">
                <Icon size={14} aria-hidden="true" />
                <span className="theme-active-check">
                  <Check size={11} aria-hidden="true" />
                </span>
              </span>
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      <ul className="mt-2 space-y-1">
        {THEME_META.map((t) => (
          <li key={t.id} className="text-[11px] leading-snug text-faint">
            {/* Same CSS-driven highlight as the buttons, same reason. */}
            <span data-theme-choice={t.id} className="font-semibold text-muted">
              {t.label}
            </span>{" "}
            {t.description}
          </li>
        ))}
      </ul>
    </div>
  );
}
