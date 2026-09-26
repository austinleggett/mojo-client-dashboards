"use client";

// A plain 3-way Light / Dark / Auto control -- deliberately labeled
// text buttons rather than icon-only, matching how every other control
// on this dashboard (Approved, Needs edits, S / M / L font size...)
// prefers a clear word over a symbol someone has to guess at.
const OPTIONS = [
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
  { key: "system", label: "Auto" },
];

export default function ThemeToggle({ theme, onChange, className }) {
  return (
    <div className={`theme-toggle${className ? ` ${className}` : ""}`} role="group" aria-label="Color theme">
      {OPTIONS.map((o) => (
        <button
          key={o.key}
          type="button"
          className={`theme-toggle-btn${theme === o.key ? " on" : ""}`}
          aria-pressed={theme === o.key}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
