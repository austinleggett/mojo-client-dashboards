"use client";

// A tiny formatting toolbar for a RichEditable field: bold / italic /
// underline, left / center / right alignment, three font-size presets,
// and a handful of preset text colors. Deliberately not a full
// rich-text-editor library -- this is "core formatting" for dashboard
// prose, not a document editor.
//
// The onMouseDown handler on the wrapper is the standard trick for
// contentEditable toolbars: preventing the mousedown's default action
// stops the browser from shifting focus (and losing the text
// selection) to the button, so by the time onClick fires, the field is
// still focused and the user's selection is still live.

// A small, fixed palette rather than a full color picker -- covers the
// common "call out a number" cases (green for good, red for bad) plus
// a couple of neutral options. Green matches the brand's existing
// --good color (used elsewhere for positive stat callouts) so a
// hand-colored "good" number and an automatic one look the same.
const TEXT_COLORS = [
  { label: "Default", hex: "#232420" },
  { label: "Gray", hex: "#5c5c52" },
  { label: "Green", hex: "#2f7a4f" },
  { label: "Red", hex: "#c0392b" },
  { label: "Blue", hex: "#2563eb" },
];

export default function FormatToolbar({ getTarget }) {
  function exec(command) {
    document.execCommand(command, false, null);
  }

  // Alignment is a whole-field property here (these are single-block
  // fields, not multi-paragraph documents), so rather than lean on
  // execCommand's inconsistent block-alignment behavior, wrap the
  // field's entire content in one <div style="text-align:...">,
  // updating it in place on repeated clicks instead of nesting.
  function setAlign(align) {
    const target = getTarget();
    if (!target) return;
    const first = target.firstElementChild;
    const isWrapper =
      target.children.length === 1 &&
      first &&
      first.tagName === "DIV" &&
      /text-align\s*:/.test(first.getAttribute("style") || "");
    if (isWrapper) {
      first.style.textAlign = align;
    } else {
      target.innerHTML = `<div style="text-align:${align}">${target.innerHTML}</div>`;
    }
  }

  // Font size on a *selection* (not the whole field) has to go through
  // execCommand -- there's no other reliable way to wrap an arbitrary
  // mid-text selection. execCommand("fontSize") only understands the
  // legacy 1-7 scale and produces <font size="7"> elements, so we
  // immediately swap those for <span style="font-size:...">, which is
  // what the sanitizer and every other renderer here expects.
  function setFontSize(px) {
    const target = getTarget();
    if (!target) return;
    document.execCommand("fontSize", false, "7");
    target.querySelectorAll('font[size="7"]').forEach((f) => {
      const span = document.createElement("span");
      span.style.fontSize = px;
      span.innerHTML = f.innerHTML;
      f.replaceWith(span);
    });
  }

  // Same pattern as setFontSize: execCommand("foreColor") is the only
  // reliable way to wrap an arbitrary mid-text selection, it just
  // produces a legacy <font color="..."> that we immediately swap for
  // <span style="color:...">. "Default" re-applies the same near-black
  // used elsewhere on the dashboard, which in practice is how you
  // "clear" a color you set earlier.
  function setColor(hex) {
    const target = getTarget();
    if (!target) return;
    document.execCommand("foreColor", false, hex);
    target.querySelectorAll("font[color]").forEach((f) => {
      const span = document.createElement("span");
      span.style.color = f.getAttribute("color");
      span.innerHTML = f.innerHTML;
      f.replaceWith(span);
    });
  }

  return (
    <div className="format-toolbar" onMouseDown={(e) => e.preventDefault()}>
      <button type="button" title="Bold" onClick={() => exec("bold")}>
        <b>B</b>
      </button>
      <button type="button" title="Italic" onClick={() => exec("italic")}>
        <i>I</i>
      </button>
      <button type="button" title="Underline" onClick={() => exec("underline")}>
        <u>U</u>
      </button>
      <span className="toolbar-sep" />
      <button type="button" title="Align left" onClick={() => setAlign("left")}>
        ⯇
      </button>
      <button type="button" title="Align center" onClick={() => setAlign("center")}>
        ▤
      </button>
      <button type="button" title="Align right" onClick={() => setAlign("right")}>
        ⯈
      </button>
      <span className="toolbar-sep" />
      <button type="button" title="Small text" className="fs-btn" onClick={() => setFontSize("12px")}>
        S
      </button>
      <button type="button" title="Normal text" className="fs-btn" onClick={() => setFontSize("15px")}>
        M
      </button>
      <button type="button" title="Large text" className="fs-btn" onClick={() => setFontSize("19px")}>
        L
      </button>
      <span className="toolbar-sep" />
      {TEXT_COLORS.map((c) => (
        <button
          key={c.hex}
          type="button"
          title={c.label}
          className="color-btn"
          style={{ "--swatch": c.hex }}
          onClick={() => setColor(c.hex)}
        />
      ))}
    </div>
  );
}
