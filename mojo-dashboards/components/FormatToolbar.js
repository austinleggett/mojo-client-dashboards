"use client";

// The dashboard's formatting toolbar -- a single instance, pinned to
// the top of the page for the whole time you're in edit mode, like a
// word processor's ribbon. This used to be a small popup that appeared
// next to whichever field you'd clicked into; that meant it could
// overlap a neighboring card and become impossible to see or click, so
// it's been pulled out of the page flow entirely and lives here
// instead. This component is purely the buttons -- Dashboard.js owns
// all the actual DOM/selection logic (see runOnTargets there), so it
// can apply a command to whichever field(s) are currently selected,
// including more than one at once (shift-click to add a box to the
// selection).
const TEXT_COLORS = [
  { label: "Default", hex: "#232420" },
  { label: "Gray", hex: "#5c5c52" },
  { label: "Green", hex: "#2f7a4f" },
  { label: "Red", hex: "#c0392b" },
  { label: "Blue", hex: "#2563eb" },
];

export default function FormatToolbar({
  selectionCount = 0,
  onClearSelection,
  onBold,
  onItalic,
  onUnderline,
  onAlign,
  onFontSize,
  onColor,
  onUndo,
  canUndo,
}) {
  // Same trick as before: preventing the mousedown's default action
  // stops the browser from shifting focus (and losing whatever text
  // selection is live) to the button, so by the time onClick fires,
  // the field the user was working in is still focused and selected.
  return (
    <div className="top-format-bar" onMouseDown={(e) => e.preventDefault()}>
      <div className="top-format-group">
        <button type="button" title="Bold" onClick={onBold}>
          <b>B</b>
        </button>
        <button type="button" title="Italic" onClick={onItalic}>
          <i>I</i>
        </button>
        <button type="button" title="Underline" onClick={onUnderline}>
          <u>U</u>
        </button>
      </div>
      <span className="toolbar-sep" />
      <div className="top-format-group">
        <button type="button" title="Align left" onClick={() => onAlign("left")}>
          ⯇
        </button>
        <button type="button" title="Align center" onClick={() => onAlign("center")}>
          ▤
        </button>
        <button type="button" title="Align right" onClick={() => onAlign("right")}>
          ⯈
        </button>
      </div>
      <span className="toolbar-sep" />
      <div className="top-format-group">
        <button type="button" title="Small text" className="fs-btn" onClick={() => onFontSize("12px")}>
          S
        </button>
        <button type="button" title="Normal text" className="fs-btn" onClick={() => onFontSize("15px")}>
          M
        </button>
        <button type="button" title="Large text" className="fs-btn" onClick={() => onFontSize("19px")}>
          L
        </button>
      </div>
      <span className="toolbar-sep" />
      <div className="top-format-group">
        {TEXT_COLORS.map((c) => (
          <button
            key={c.hex}
            type="button"
            title={c.label}
            className="color-btn"
            style={{ "--swatch": c.hex }}
            onClick={() => onColor(c.hex)}
          />
        ))}
      </div>

      <span className="toolbar-flex-spacer" />

      {selectionCount > 0 && (
        <div className="selection-indicator">
          {selectionCount === 1 ? "1 box selected" : `${selectionCount} boxes selected`}
          <button type="button" className="selection-clear" onClick={onClearSelection} title="Clear selection">
            &times;
          </button>
        </div>
      )}
      {selectionCount === 0 && (
        <div className="selection-hint">Click a text box to format it &middot; shift-click to select several</div>
      )}

      <span className="toolbar-sep" />
      <button type="button" className="undo-btn" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)">
        &#8630; Undo
      </button>
    </div>
  );
}
