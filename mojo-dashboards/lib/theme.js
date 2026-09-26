"use client";

// Shared light/dark/system theme control -- one small hook so any page
// (the client dashboard, admin, staff login) can read and change the
// viewer's own preference, independent of what anyone else viewing the
// same client's dashboard has chosen. Deliberately per-browser (see
// THEME_KEY below), not saved on the client's `content` -- this is a
// "how do I want to look at this" preference, not part of the
// dashboard's own data.
import { useCallback, useEffect, useState } from "react";

export const THEME_KEY = "mojo-dashboard-theme";

function systemPrefersDark() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

// Keeps the <html data-theme="..."> attribute (which app/globals.css's
// :root[data-theme="dark"] / :root:not([data-theme="light"]) rules key
// off of) in sync with an explicit choice. "system" removes the
// attribute entirely so the prefers-color-scheme media query alone
// decides, exactly like before this toggle existed.
function applyThemeAttr(theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") root.setAttribute("data-theme", theme);
  else root.removeAttribute("data-theme");
}

// Returns { theme, isDark, setTheme } -- `theme` is the raw choice
// ("light" | "dark" | "system"), `isDark` is that choice already
// resolved against the system preference when it's "system", so
// callers that need one concrete yes/no answer (like Dashboard.js's
// brandVars, which has to compute actual mixed colors rather than rely
// on a CSS media query) don't each have to re-derive it.
export function useTheme() {
  const [theme, setThemeState] = useState("system");
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    let saved = "system";
    try {
      saved = window.localStorage.getItem(THEME_KEY) || "system";
    } catch {
      // Private browsing / storage blocked -- fall back to "system"
      // silently, same as if nothing had ever been saved.
    }
    setThemeState(saved);
    applyThemeAttr(saved);
    setIsDark(saved === "dark" || (saved === "system" && systemPrefersDark()));

    // Only matters while "system" is the active choice, but it's cheap
    // to just always listen -- an explicit light/dark pick never reads
    // this again.
    const mq = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
    if (!mq) return undefined;
    const onChange = () => {
      setThemeState((current) => {
        if (current === "system") setIsDark(systemPrefersDark());
        return current;
      });
    };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else if (mq.removeListener) mq.removeListener(onChange);
    };
  }, []);

  const setTheme = useCallback((next) => {
    setThemeState(next);
    applyThemeAttr(next);
    setIsDark(next === "dark" || (next === "system" && systemPrefersDark()));
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Nothing to persist to -- the choice still applies for this
      // page view, it just won't be remembered next visit.
    }
  }, []);

  return { theme, isDark, setTheme };
}
