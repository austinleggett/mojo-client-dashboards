"use client";

import { useEffect, useMemo, useRef, useState, useCallback, useContext, createContext } from "react";
import { NAV_SECTIONS, BUILTIN_SECTIONS, ITEM_TEMPLATES, DEFAULT_SECTION_ORDER } from "@/lib/contentTemplate";
import { getPath, setPath, pushAt, removeAt } from "@/lib/path";
import { SortableGroup, arrayMove } from "@/components/Sortable";
import FormatToolbar from "@/components/FormatToolbar";
import ThemeToggle from "@/components/ThemeToggle";
import { useTheme } from "@/lib/theme";
import { safeUrl, linkAttrs, linkifyNode, makeLink, displayUrl, LINK_CLASS, CTA_CLASS } from "@/lib/links";

// Two small contexts so RichEditable (defined once, used ~40+ times
// across this file) can register itself with, and read its selection
// state from, the single top-of-page format bar -- without threading
// new props through every one of those call sites.
//
// Split in two on purpose: FieldActionsContext holds only stable
// (useCallback'd, never-changing) functions, so a field's
// register-my-DOM-node effect never has to re-run just because the
// *selection* changed elsewhere on the page. FieldSelectionContext
// holds the live "which paths are selected" array, which every rich
// field does need to re-read (to know whether to show its own
// selected/active highlight) whenever it changes.
const FieldActionsContext = createContext(null);
const FieldSelectionContext = createContext([]);

const CheckIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 10.5l3.5 3.5L16 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// A contentEditable field bound to a dot-path in the content tree.
// Reads from `value`; writes back via onCommit(path, newText) on blur.
// Only touches the DOM from an effect when the value actually differs
// from what's rendered, so an in-progress edit never gets stomped on
// or loses cursor position from its own re-render.
//
// Plain text only, on purpose: the one remaining use of this component
// is the sidebar nav labels, which are a rename, not prose -- every
// other user-facing text field uses RichEditable below instead.
function Editable({ as: Tag = "span", value, path, editing, onCommit, className, ...rest }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current && ref.current.textContent !== (value ?? "")) {
      ref.current.textContent = value ?? "";
    }
  }, [value]);

  return (
    <Tag
      ref={ref}
      className={className}
      contentEditable={editing}
      suppressContentEditableWarning
      onBlur={
        editing
          ? (e) => {
              const text = e.currentTarget.textContent;
              if (text !== value) onCommit(path, text);
            }
          : undefined
      }
      {...rest}
    />
  );
}

// Same idea as Editable, but stores sanitized HTML instead of plain
// text, so it can carry bold/italic/underline/alignment/font-size --
// "standard word editing features" -- on essentially every editable
// text field on the dashboard. See lib/sanitize.js for the matching
// server-side allowlist, which must stay in sync with every field that
// uses this component instead of plain Editable.
function RichEditable({ as: Tag = "div", value, path, editing, onCommit, className }) {
  const ref = useRef(null);
  const [focused, setFocused] = useState(false);
  const fieldActions = useContext(FieldActionsContext);
  const selectedFields = useContext(FieldSelectionContext);
  const selected = selectedFields.includes(path);

  useEffect(() => {
    if (!ref.current) return;
    if (serializeField(ref.current) !== (value ?? "")) {
      ref.current.innerHTML = value ?? "";
    }
    decorateField(ref.current, editing);
  }, [value, editing]);

  // Hand this field's live DOM node to the shared registry so the
  // top-of-page format bar can act on it later -- including when it
  // isn't the field currently focused, which is what makes multi-box
  // formatting (shift-click several boxes, then apply once) possible.
  // Depends only on the stable actions object, not on selection state,
  // so this doesn't re-run every time the selection changes elsewhere.
  useEffect(() => {
    if (!fieldActions) return undefined;
    fieldActions.registerNode(path, ref.current);
    return () => fieldActions.registerNode(path, null);
  }, [path, fieldActions]);

  return (
    <div
      className={`rich-field${editing ? (focused || selected ? " rich-field-active" : " rich-field-hint") : ""}${
        selected ? " rich-field-selected" : ""
      }`}
    >
      <Tag
        ref={ref}
        className={className}
        contentEditable={editing}
        suppressContentEditableWarning
        onMouseDown={
          editing && fieldActions
            ? (e) => {
                // Shift-click adds/removes this box from the current
                // multi-selection for bulk formatting, instead of
                // moving the caret into it -- preventDefault stops the
                // browser from focusing (and entering edit mode on)
                // this field at all.
                if (e.shiftKey) {
                  e.preventDefault();
                  fieldActions.toggleSelect(path);
                }
              }
            : undefined
        }
        onFocus={
          editing
            ? () => {
                setFocused(true);
                if (fieldActions) fieldActions.selectOnly(path);
              }
            : undefined
        }
        onBlur={
          editing
            ? (e) => {
                setFocused(false);
                // Auto-link anything that looks like a web address,
                // email or phone number before saving the field.
                linkifyNode(e.currentTarget);
                const html = serializeField(e.currentTarget);
                if (html !== (value ?? "")) onCommit(path, html);
              }
            : undefined
        }
        onClick={
          editing && fieldActions
            ? (e) => {
                // While editing, clicking a link or button opens the
                // Open / Edit / Remove menu instead of following it.
                const a = e.target.closest && e.target.closest("a");
                if (a && ref.current && ref.current.contains(a)) {
                  e.preventDefault();
                  fieldActions.openLinkMenu({ path, node: ref.current, anchor: a });
                }
              }
            : undefined
        }
      />
    </div>
  );
}


// The HTML a rich field actually saves -- its live DOM minus the
// editing-only attributes decorateField() adds (contenteditable="false"
// on CTA buttons), so those never get stored.
function serializeField(node) {
  if (!node.querySelector("[contenteditable]")) return node.innerHTML;
  const clone = node.cloneNode(true);
  clone.querySelectorAll("[contenteditable]").forEach((el) => el.removeAttribute("contenteditable"));
  return clone.innerHTML;
}

// Per-render touches on a rich field's DOM that aren't stored content:
// in view mode, bare URLs / emails / phone numbers become clickable
// (so older text with a pasted link works without anyone re-saving
// it); in edit mode, a CTA button becomes one solid, non-typeable
// block, so it can't be half-edited by accident -- its label and link
// are changed through its Edit menu instead.
function decorateField(node, editing) {
  if (!node) return;
  if (editing) {
    node.querySelectorAll(`a.${CTA_CLASS}`).forEach((a) => a.setAttribute("contenteditable", "false"));
  } else {
    node.querySelectorAll("[contenteditable]").forEach((el) => el.removeAttribute("contenteditable"));
    linkifyNode(node);
  }
}

function RemoveBtn({ onClick, label }) {
  return (
    <button type="button" className="rm-btn edit-ctl" onClick={onClick} aria-label={label || "Remove"}>
      &times;
    </button>
  );
}

function AddBtn({ onClick, label }) {
  return (
    <button type="button" className="add-btn edit-ctl" onClick={onClick}>
      + {label}
    </button>
  );
}

// The client-facing approve / needs-edits control for a "Ready for
// Review" or "Questions & Requests" item. `canRespond` is true for
// staff and for a client who's logged into their portal (see
// app/c/[slug]/page.js) -- everyone else (a plain visitor on a client
// whose portal login isn't set up yet) sees a read-only badge, and
// nothing at all once an item is still "pending" (no need to show a
// passerby a control they can't use).
//
// Status changes save immediately on click, since there's no separate
// "Save changes" step in the client's world -- but the comment
// textarea buffers locally and only saves on blur, same as every
// other text field on the dashboard, so a client isn't firing a
// network write on every keystroke.
function ApprovalWidget({ status, comment, canRespond, onStatusChange, onCommentCommit }) {
  const effective = status || "pending";
  const [draft, setDraft] = useState(comment || "");
  useEffect(() => {
    setDraft(comment || "");
  }, [comment]);

  if (!canRespond) {
    if (effective === "pending") return null;
    return (
      <div className={`approval-badge ${effective}`}>
        <span>{effective === "approved" ? "Client approved" : "Client requested edits"}</span>
        {effective === "needs_edits" && comment && <p className="approval-comment-ro">{comment}</p>}
      </div>
    );
  }

  return (
    <div className="approval-widget">
      <div className="approval-toggle">
        <button
          type="button"
          className={`approval-btn approve${effective === "approved" ? " on" : ""}`}
          onClick={() => onStatusChange(effective === "approved" ? "pending" : "approved")}
        >
          <CheckIcon /> Approved
        </button>
        <button
          type="button"
          className={`approval-btn edits${effective === "needs_edits" ? " on" : ""}`}
          onClick={() => onStatusChange(effective === "needs_edits" ? "pending" : "needs_edits")}
        >
          Needs edits
        </button>
      </div>
      {effective === "needs_edits" && (
        <textarea
          className="approval-comment"
          placeholder="What needs to change?"
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== (comment || "")) onCommentCommit(draft);
          }}
        />
      )}
    </div>
  );
}

// Same idea as ApprovalWidget, for an upcoming event or a recurring
// meeting -- but "approve this copy" doesn't fit a calendar item, so
// the three options here are Approve / Reschedule / Cancel, and the
// conditional note box appears for either of the two that need a
// client's input (a preferred new time, or a reason), not just one.
function EventStatusWidget({ status, comment, canRespond, onStatusChange, onCommentCommit }) {
  const effective = status || "pending";
  const needsNote = effective === "reschedule" || effective === "cancel";
  const [draft, setDraft] = useState(comment || "");
  useEffect(() => {
    setDraft(comment || "");
  }, [comment]);

  if (!canRespond) {
    if (effective === "pending") return null;
    const label =
      effective === "approved" ? "Approved" : effective === "reschedule" ? "Reschedule requested" : "Cancellation requested";
    return (
      <div className={`approval-badge ${effective}`}>
        <span>{label}</span>
        {needsNote && comment && <p className="approval-comment-ro">{comment}</p>}
      </div>
    );
  }

  return (
    <div className="approval-widget">
      <div className="approval-toggle three">
        <button
          type="button"
          className={`approval-btn approve${effective === "approved" ? " on" : ""}`}
          onClick={() => onStatusChange(effective === "approved" ? "pending" : "approved")}
        >
          <CheckIcon /> Approve
        </button>
        <button
          type="button"
          className={`approval-btn reschedule${effective === "reschedule" ? " on" : ""}`}
          onClick={() => onStatusChange(effective === "reschedule" ? "pending" : "reschedule")}
        >
          Reschedule
        </button>
        <button
          type="button"
          className={`approval-btn cancel${effective === "cancel" ? " on" : ""}`}
          onClick={() => onStatusChange(effective === "cancel" ? "pending" : "cancel")}
        >
          Cancel
        </button>
      </div>
      {needsNote && (
        <textarea
          className="approval-comment"
          placeholder={effective === "reschedule" ? "What date/time works better?" : "Anything we should know? (optional)"}
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== (comment || "")) onCommentCommit(draft);
          }}
        />
      )}
    </div>
  );
}


// A card's own optional call-to-action button (item.link = { label,
// url }) -- on review items, questions, events, meetings and custom
// section cards. A consistent "Review it here" button at the bottom of
// a card, without anyone having to format one by hand in the text.
function CardLink({ link, editing, onEdit, onRemove }) {
  const href = link ? safeUrl(link.url) : null;
  const style = link && link.color ? ctaStyle(link.color) : undefined;
  const label = (link && link.label) || "Open link";
  if (!editing) {
    if (!href) return null;
    return (
      <div className="card-cta-row">
        <a className={`${CTA_CLASS} card-cta`} href={href} style={style} {...linkAttrs(href)}>
          {label}
        </a>
      </div>
    );
  }
  return (
    <div className="card-cta-row card-cta-edit">
      {href ? (
        <>
          <span className={`${CTA_CLASS} card-cta`} title={href} style={style}>
            {label}
          </span>
          <button type="button" className="mini-btn" onClick={onEdit}>
            Edit button
          </button>
          <button type="button" className="mini-btn danger" onClick={onRemove}>
            Remove
          </button>
        </>
      ) : (
        <button type="button" className="add-btn" onClick={onEdit}>
          + Add button link
        </button>
      )}
    </div>
  );
}

// The small form for adding or editing a link or a button. `mode` is
// "link" (inline text link), "button" (a CTA button inside a text
// field) or "card" (a card's own button).
function LinkDialog({ mode, initial, onSubmit, onCancel, onRemove, palette = [], defaultColor }) {
  const [label, setLabel] = useState(initial?.label || "");
  // "" = the dashboard's button color (meta.buttonColor); otherwise a
  // specific brand color just for this button.
  const [color, setColor] = useState(initial?.color || "");
  const [url, setUrl] = useState(initial?.url || "");
  const [error, setError] = useState("");
  const urlRef = useRef(null);
  useEffect(() => {
    urlRef.current?.focus();
  }, [initial]);
  const isButton = mode === "button" || mode === "card";
  const href = safeUrl(url);
  function submit(e) {
    e.preventDefault();
    if (!href) {
      setError("Enter a web address (like kenkilday.com/blog), an email address or a phone number.");
      return;
    }
    if (isButton && !label.trim()) {
      setError("Give the button some text, like \u201cReview the October content.\u201d");
      return;
    }
    onSubmit({ label: label.trim(), url: href, color: isButton ? color : "" });
  }
  const title = initial?.editing
    ? isButton ? "Edit button" : "Edit link"
    : isButton ? "Add a button" : "Add a link";
  return (
    <div className="link-dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="link-dialog" onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && onCancel()}>
        <h4>{title}</h4>
        <label>
          {isButton ? "Button text" : "Text to show"}
          <input
            type="text"
            value={label}
            maxLength={120}
            placeholder={isButton ? "Review the October content" : "Leave blank to show the address"}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <label>
          Link
          <input
            ref={urlRef}
            type="text"
            value={url}
            placeholder="https://… , name@email.com or 480-555-0100"
            onChange={(e) => {
              setUrl(e.target.value);
              setError("");
            }}
          />
        </label>
        {isButton && (
          <div className="link-dialog-colors">
            <span className="link-dialog-preview-label">Button color</span>
            <div className="palette-pick">
              <button
                type="button"
                className={`palette-chip${!color ? " on" : ""}`}
                style={{ background: defaultColor }}
                title="Dashboard button color (set under Brand colors)"
                onClick={() => setColor("")}
              >
                <span>Default</span>
              </button>
              {palette
                .filter((hex) => hex.toLowerCase() !== String(defaultColor).toLowerCase())
                .map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    className={`palette-chip${color === hex ? " on" : ""}`}
                    style={{ background: hex }}
                    title={hex}
                    onClick={() => setColor(hex)}
                  />
                ))}
            </div>
          </div>
        )}
        {isButton && (
          <div className="link-dialog-preview">
            <span className="link-dialog-preview-label">Preview</span>
            <span className={CTA_CLASS} style={color ? ctaStyle(color) : undefined}>
              {label.trim() || "Button text"}
            </span>
          </div>
        )}
        {error && <p className="link-dialog-error">{error}</p>}
        <div className="link-dialog-actions">
          {onRemove && (
            <button type="button" className="mini-btn danger" onClick={onRemove}>
              Remove
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="mini-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="mini-btn primary">
            {initial?.editing ? "Save" : isButton ? "Add button" : "Add link"}
          </button>
        </div>
      </form>
    </div>
  );
}

// The Open / Edit / Remove menu shown when a link or button inside a
// text field is clicked while editing.
function LinkMenu({ anchor, onOpen, onEdit, onRemove, onClose }) {
  const menuRef = useRef(null);
  const [pos, setPos] = useState(null);
  useEffect(() => {
    const r = anchor.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 260)) });
    function onDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    }
    function onScroll() {
      onClose();
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [anchor, onClose]);
  if (!pos) return null;
  const href = anchor.getAttribute("href") || "";
  return (
    <div ref={menuRef} className="link-menu" style={{ top: pos.top, left: pos.left }} onMouseDown={(e) => e.preventDefault()}>
      <span className="link-menu-url" title={href}>{displayUrl(href)}</span>
      <button type="button" onClick={onOpen}>Open ↗</button>
      <button type="button" onClick={onEdit}>Edit</button>
      <button type="button" className="danger" onClick={onRemove}>Remove</button>
    </div>
  );
}


// Plain text from a stored rich-text field.
function htmlToText(html) {
  if (typeof document === "undefined") return String(html || "").replace(/<[^>]*>/g, "");
  const d = document.createElement("div");
  d.innerHTML = html || "";
  d.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  return (d.textContent || "").replace(/ /g, " ").trim();
}
const isOpen = (item) => (item.status || "pending") !== "approved";

// On the Monthly Meeting tab: a one-line pointer to whatever is still
// open on the Weekly Update, so those items live in one place only.
function WeeklyOpenItems({ weekly, onOpen }) {
  const review = (weekly.review?.groups || []).flatMap((g) => g.items || []).filter(isOpen).length;
  const questions = (weekly.questions?.items || []).filter(isOpen).length;
  if (!review && !questions) return null;
  const parts = [];
  if (review) parts.push(`${review} item${review === 1 ? "" : "s"} ready for your review`);
  if (questions) parts.push(`${questions} open question${questions === 1 ? "" : "s"} & request${questions === 1 ? "" : "s"}`);
  return (
    <div className="weekly-open-items">
      <span>
        <b>From the weekly update:</b> {parts.join(" · ")}
      </span>
      <button type="button" className="mini-btn" onClick={onOpen}>
        Open Weekly Update →
      </button>
    </div>
  );
}

// Full-screen, slide-by-slide view of the Monthly Meeting tab, for
// presenting on Zoom or in person: a title slide, one slide per
// section (in the tab's own order), and a closing slide. Arrow keys,
// space, or the on-screen arrows move between slides; Esc exits.
function PresentMode({ content, sectionOrder, renderers, navLabelFor, onExit }) {
  const meta = content.meta || {};
  const slides = useMemo(
    () => [{ kind: "title" }, ...sectionOrder.filter((id) => renderers[id]).map((id) => ({ kind: "section", id })), { kind: "end" }],
    [sectionOrder, renderers]
  );
  const [i, setI] = useState(0);
  const go = useCallback((d) => setI((n) => Math.max(0, Math.min(slides.length - 1, n + d))), [slides.length]);
  useEffect(() => {
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {});
    function onKey(e) {
      if (["ArrowRight", "PageDown", " ", "Enter"].includes(e.key)) {
        e.preventDefault();
        go(1);
      } else if (["ArrowLeft", "PageUp", "Backspace"].includes(e.key)) {
        e.preventDefault();
        go(-1);
      } else if (e.key === "Escape") {
        onExit();
      }
    }
    window.addEventListener("keydown", onKey);
    document.body.classList.add("presenting");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("presenting");
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    };
  }, [go, onExit]);
  const slide = slides[i];
  const next = (content.meetings?.items || [])[0];
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return (
    <div className="present-overlay">
      <div className="present-top">
        <span className="present-client">{htmlToText(meta.clientName)}</span>
        <span className="present-count">
          {i + 1} / {slides.length}
        </span>
        <button type="button" className="present-exit" onClick={onExit}>
          Exit (Esc)
        </button>
      </div>
      <div className="present-stage" key={i}>
        {slide.kind === "title" && (
          <div className="present-title-slide">
            {meta.clientLogo ? (
              <div className="present-logo" style={{ background: meta.clientLogoBg || "#fdfdf9" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={meta.clientLogo} alt="" />
              </div>
            ) : null}
            <h1>{htmlToText(meta.clientName)}</h1>
            <p className="present-sub">Monthly Meeting · {today}</p>
            {meta.contactName && (
              <p className="present-with">
                with {htmlToText(meta.contactName)}, {htmlToText(meta.contactTitle)}
              </p>
            )}
          </div>
        )}
        {slide.kind === "section" && <div className="present-section">{renderers[slide.id]()}</div>}
        {slide.kind === "end" && (
          <div className="present-title-slide">
            <h1>Thank you!</h1>
            {next && (
              <p className="present-sub">
                {htmlToText(next.name)}: {htmlToText(next.next)}
              </p>
            )}
            <p className="present-with">
              {[meta.contactName, meta.contactEmail, meta.contactPhone].map(htmlToText).filter(Boolean).join(" · ")}
            </p>
          </div>
        )}
      </div>
      <div className="present-nav">
        <button type="button" onClick={() => go(-1)} disabled={i === 0} aria-label="Previous slide">
          ←
        </button>
        <div className="present-dots">
          {slides.map((sl, n) => (
            <button
              key={n}
              type="button"
              className={`present-dot${n === i ? " on" : ""}`}
              onClick={() => setI(n)}
              title={sl.kind === "section" ? navLabelFor(sl.id === "reviewQuestions" ? "review" : sl.id) : sl.kind === "title" ? "Title" : "Wrap-up"}
            />
          ))}
        </div>
        <button type="button" onClick={() => go(1)} disabled={i === slides.length - 1} aria-label="Next slide">
          →
        </button>
      </div>
    </div>
  );
}

// Builds this week's update email from the Weekly Update tab -- the
// same sections, in the same order, as the page -- for staff to copy
// into their own email. The HTML version keeps links and bold text
// (it's the already-sanitized page content); the plain-text version is
// the fallback for email apps that don't accept pasted formatting.
function buildWeeklyEmail({ content, sectionOrder, navLabelFor, dashboardUrl, accent }) {
  const meta = content.meta || {};
  const client = htmlToText(meta.clientName) || "your team";
  const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const date = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const blocks = []; // { title, items: [{ html, text, link? }] }
  const cardLink = (it) => (it.link && safeUrl(it.link.url) ? { label: it.link.label || "Open link", url: safeUrl(it.link.url) } : null);
  const join = (...parts) => parts.filter((p) => p && htmlToText(p)).join(" — ");

  for (const id of sectionOrder) {
    if (id === "reviewQuestions") {
      const review = (content.review?.groups || []).flatMap((g) =>
        (g.items || []).filter(isOpen).map((it) => ({ ...it, _group: g.label }))
      );
      if (review.length)
        blocks.push({
          title: navLabelFor("review"),
          items: review.map((it) => ({
            html: `<b>${it.title}</b>${htmlToText(it.store) ? ` (${it.store})` : ""}${htmlToText(it._group) ? ` · ${it._group}` : ""}${htmlToText(it.desc) ? `<br>${it.desc}` : ""}`,
            text: `${htmlToText(it.title)}${htmlToText(it.store) ? ` (${htmlToText(it.store)})` : ""}${htmlToText(it._group) ? ` · ${htmlToText(it._group)}` : ""}${htmlToText(it.desc) ? `\n   ${htmlToText(it.desc)}` : ""}`,
            link: cardLink(it),
          })),
        });
      const qs = (content.questions?.items || []).filter(isOpen);
      if (qs.length)
        blocks.push({
          title: navLabelFor("questions"),
          items: qs.map((q) => ({
            html: `<b>${q.title}</b>${htmlToText(q.store) ? ` (${q.store})` : ""}${htmlToText(q.excerpt) ? `<br><i>${q.excerpt}</i>` : ""}${htmlToText(q.response) ? `<br>${q.response}` : ""}`,
            text: `${htmlToText(q.title)}${htmlToText(q.store) ? ` (${htmlToText(q.store)})` : ""}${htmlToText(q.excerpt) ? `\n   "${htmlToText(q.excerpt)}"` : ""}${htmlToText(q.response) ? `\n   ${htmlToText(q.response)}` : ""}`,
            link: cardLink(q),
          })),
        });
    } else if (id === "working") {
      const cols = (content.working?.columns || []).filter((c) => (c.items || []).length);
      if (cols.length)
        blocks.push({
          title: navLabelFor("working"),
          items: cols.map((c) => ({
            html: `<b>${c.label}:</b> ${c.items.join(" · ")}`,
            text: `${htmlToText(c.label)}: ${c.items.map(htmlToText).join(" · ")}`,
          })),
        });
    } else if (id === "approved") {
      const items = content.approved?.items || [];
      if (items.length) blocks.push({ title: navLabelFor("approved"), items: items.map((t) => ({ html: t, text: htmlToText(t) })) });
    } else if (id === "upcoming") {
      const evs = (content.events?.items || []).map((e) => ({
        html: `<b>${htmlToText(e.mon)} ${htmlToText(e.day)}</b> — ${join(e.title, e.loc)}`,
        text: `${htmlToText(e.mon)} ${htmlToText(e.day)} — ${[e.title, e.loc].map(htmlToText).filter(Boolean).join(" — ")}`,
        link: cardLink(e),
      }));
      const ms = (content.meetings?.items || []).map((m) => ({
        html: `<b>${m.name}</b> — ${join(m.next, m.freq)}`,
        text: `${htmlToText(m.name)} — ${[m.next, m.freq].map(htmlToText).filter(Boolean).join(" — ")}`,
        link: cardLink(m),
      }));
      if (evs.length || ms.length) blocks.push({ title: navLabelFor("upcoming"), items: [...evs, ...ms] });
    } else if (id === "momentum") {
      const items = content.momentum?.items || [];
      if (items.length)
        blocks.push({
          title: navLabelFor("momentum"),
          items: items.map((m) => ({ html: `<b>${m.month}:</b> ${m.text}`, text: `${htmlToText(m.month)}: ${htmlToText(m.text)}` })),
        });
    } else {
      const cs = (content.customSections || []).find((c) => c.id === id);
      if (cs && (cs.items || []).length)
        blocks.push({
          title: navLabelFor(id),
          items: cs.items.map((it) => ({ html: it.text, text: htmlToText(it.text), link: cardLink(it) })),
        });
    }
  }

  const subject = `${client} weekly update · ${date}`;
  const sign = [meta.contactName, meta.contactTitle, meta.contactEmail, meta.contactPhone].map(htmlToText).filter(Boolean);
  const btn = (url, label) =>
    `<a href="${esc(url)}" style="display:inline-block;background:${/^#[0-9a-f]{6}$/i.test(accent || "") ? accent : "#1f4d3a"};color:${contrastText(accent || "#1f4d3a")};padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">${esc(label)} &rarr;</a>`;

  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#232420">` +
    `<p>Hi ${esc(client)} team,</p>` +
    `<p>Here&rsquo;s your weekly update from Mountain Mojo: what&rsquo;s done, what&rsquo;s next, and what we need from you to keep moving.</p>` +
    `<p>${btn(dashboardUrl, "Open your dashboard")}</p>` +
    blocks
      .map(
        (b) =>
          `<h3 style="font-size:15px;margin:18px 0 6px">${esc(b.title)}</h3><ul style="margin:0;padding-left:20px">` +
          b.items
            .map(
              (it) =>
                `<li style="margin-bottom:6px">${it.html}${it.link ? `<br><a href="${esc(it.link.url)}">${esc(it.link.label)} &rarr;</a>` : ""}</li>`
            )
            .join("") +
          `</ul>`
      )
      .join("") +
    `<p style="margin-top:18px">You can approve items or request edits right on your dashboard. Let us know if you have any questions!</p>` +
    `<p>Thanks,<br>${sign.map(esc).join("<br>")}</p></div>`;

  const text =
    `Hi ${client} team,\n\nHere's your weekly update from Mountain Mojo: what's done, what's next, and what we need from you to keep moving.\n\nOpen your dashboard: ${dashboardUrl}\n` +
    blocks
      .map(
        (b) =>
          `\n${b.title.toUpperCase()}\n` +
          b.items.map((it) => `• ${it.text}${it.link ? `\n   ${it.link.label}: ${it.link.url}` : ""}`).join("\n")
      )
      .join("\n") +
    `\n\nYou can approve items or request edits right on your dashboard. Let us know if you have any questions!\n\nThanks,\n${sign.join("\n")}`;
  return { subject, html, text, empty: blocks.length === 0 };
}

function WeeklyEmailModal({ content, sectionOrder, navLabelFor, dashboardUrl, accent, justPublished, onClose, onCopied }) {
  // navLabelFor is a new function every render; the email only needs
  // rebuilding when the content or section order actually change.
  const email = useMemo(
    () => buildWeeklyEmail({ content, sectionOrder, navLabelFor, dashboardUrl, accent }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [content, sectionOrder, dashboardUrl, accent]
  );
  const [copied, setCopied] = useState("");
  async function copy(kind) {
    try {
      if (kind === "body" && window.ClipboardItem && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([email.html], { type: "text/html" }),
            "text/plain": new Blob([email.text], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(kind === "subject" ? email.subject : email.text);
      }
      setCopied(kind);
      onCopied?.();
    } catch {
      setCopied("error");
    }
  }
  return (
    <div className="link-dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="link-dialog email-dialog" onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <h4>{justPublished ? "Published! Here's this week's email" : "This week's update email"}</h4>
        <p className="email-hint">
          Copy it into your own email to {htmlToText(content.meta?.clientName) || "the client"}. Links and bold text come along
          when you paste into Gmail or Outlook.
        </p>
        <label>Subject</label>
        <div className="email-subject-row">
          <input type="text" readOnly value={email.subject} onFocus={(e) => e.target.select()} />
          <button type="button" className="mini-btn" onClick={() => copy("subject")}>
            {copied === "subject" ? "Copied ✓" : "Copy"}
          </button>
        </div>
        <label>Email</label>
        <div className="email-preview" dangerouslySetInnerHTML={{ __html: email.html }} />
        {email.empty && <p className="link-dialog-error">The weekly tab doesn&apos;t have any open items yet.</p>}
        {copied === "error" && <p className="link-dialog-error">Your browser blocked copying. Select the text above and copy it instead.</p>}
        <div className="link-dialog-actions">
          <button type="button" className="mini-btn" onClick={() => copy("text")}>
            {copied === "text" ? "Copied ✓" : "Copy as plain text"}
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="mini-btn" onClick={onClose}>
            Close
          </button>
          <button type="button" className="mini-btn primary" onClick={() => copy("body")}>
            {copied === "body" ? "Copied ✓" : "Copy email"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Staff-only list of saved backups of this tab's published version.
function HistoryModal({ slug, view, onClose, onRestore }) {
  const [versions, setVersions] = useState(null);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState(null);
  useEffect(() => {
    fetch(`/api/clients/${slug}/versions?view=${view}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Couldn't load history"))))
      .then((j) => setVersions(j.versions || []))
      .catch((e) => setError(e.message));
  }, [slug, view]);
  return (
    <div className="link-dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="link-dialog" onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <h4>{view === "weekly" ? "Weekly Update" : "Monthly Meeting"} history</h4>
        <p className="email-hint">
          A backup of the published version is saved every time a draft is published (the latest 25 are kept). Only your
          team can see these. Restoring one makes it the published version again, and backs up the current one first.
        </p>
        {error && <p className="link-dialog-error">{error}</p>}
        {!versions && !error && <p className="email-hint">Loading…</p>}
        {versions && versions.length === 0 && <p className="email-hint">No backups yet. One is saved the first time you publish a draft.</p>}
        {versions && versions.length > 0 && (
          <ul className="history-list">
            {versions.map((v) => (
              <li key={v.id}>
                <div>
                  <b>
                    {new Date(v.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                  </b>
                  <span>{v.note}</span>
                </div>
                {confirmId === v.id ? (
                  <span className="history-confirm">
                    <button type="button" className="mini-btn primary" onClick={() => onRestore(v.id)}>
                      Yes, restore
                    </button>
                    <button type="button" className="mini-btn" onClick={() => setConfirmId(null)}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button type="button" className="mini-btn" onClick={() => setConfirmId(v.id)}>
                    Restore
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="link-dialog-actions">
          <span style={{ flex: 1 }} />
          <button type="button" className="mini-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}


// A button in a specific brand color (instead of the dashboard's
// default button color): stored as inline background + text color,
// both of which lib/sanitize.js allows (hex only).
function ctaStyle(hex) {
  return { backgroundColor: hex, color: contrastText(hex) };
}
function applyCtaColor(el, hex) {
  if (hex && /^#[0-9a-f]{6}$/i.test(hex)) {
    // Written as an attribute string (not el.style) so it's stored as
    // hex -- the browser would otherwise re-serialize it as rgb().
    el.setAttribute("style", `background-color:${hex};color:${contrastText(hex)}`);
  } else {
    el.style.removeProperty("background-color");
    el.style.removeProperty("color");
    if (!el.getAttribute("style")) el.removeAttribute("style");
  }
}
function rgbToHex(rgb) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb || "");
  if (!m) return /^#[0-9a-f]{6}$/i.test(rgb || "") ? rgb : "";
  return "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
}

// Edit-mode sidebar: the client's brand palette (3+ colors) and which
// color is used for what -- the header & accents, and the buttons.
function BrandPalette({ palette, accentColor, buttonColor, onPaletteChange, onAccentChange, onButtonChange }) {
  const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  const setAt = (i, hex) => {
    const next = palette.slice();
    const prev = next[i];
    next[i] = hex;
    onPaletteChange(next, prev, hex);
  };
  return (
    <div className="brand-palette">
      <div className="brand-palette-label">Brand colors</div>
      <div className="palette-swatches">
        {palette.map((hex, i) => (
          <span className="palette-item" key={i}>
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(hex) ? hex : "#000000"} onChange={(e) => setAt(i, e.target.value)} title={hex} />
            {palette.length > 3 && !same(hex, accentColor) && !same(hex, buttonColor) && (
              <button type="button" className="palette-remove" title="Remove color" onClick={() => onPaletteChange(palette.filter((_, j) => j !== i))}>
                &times;
              </button>
            )}
          </span>
        ))}
        {palette.length < 6 && (
          <button type="button" className="palette-add" title="Add a brand color" onClick={() => onPaletteChange([...palette, "#888888"])}>
            +
          </button>
        )}
      </div>
      {[
        ["Header & accents", accentColor, onAccentChange],
        ["Buttons", buttonColor, onButtonChange],
      ].map(([label, current, onPick]) => (
        <div className="palette-role" key={label}>
          <span>{label}</span>
          <div className="palette-pick">
            {palette.map((hex, i) => (
              <button
                key={i}
                type="button"
                className={`palette-chip sm${same(hex, current) ? " on" : ""}`}
                style={{ background: hex }}
                title={hex}
                onClick={() => onPick(hex)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Setting, changing or turning off the client portal password -- its
// own dialog, never part of "Save changes", with the new password typed
// twice and turning it off as a separate, confirmed step.
function PasswordDialog({ hasPassword, saving, onSave, onClose }) {
  const [step, setStep] = useState(hasPassword ? "menu" : "set");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  function submit(e) {
    e.preventDefault();
    if (pw.trim().length < 6) return setError("Use at least 6 characters.");
    if (pw !== pw2) return setError("The two passwords don't match.");
    onSave(pw.trim());
  }
  return (
    <div className="link-dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="link-dialog" onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <h4>Client portal password</h4>
        {step === "menu" && (
          <>
            <p className="email-hint">
              A password is <b>on</b>: the client has to enter it to see their dashboard. It can&apos;t be shown here.
              Changing it means the client will need the new one.
            </p>
            <div className="link-dialog-actions">
              <button type="button" className="mini-btn danger" onClick={() => setStep("off")}>
                Turn off password
              </button>
              <span style={{ flex: 1 }} />
              <button type="button" className="mini-btn" onClick={onClose}>
                Close
              </button>
              <button type="button" className="mini-btn primary" onClick={() => setStep("set")}>
                Change password
              </button>
            </div>
          </>
        )}
        {step === "set" && (
          <form onSubmit={submit} style={{ display: "contents" }}>
            <p className="email-hint">
              {hasPassword
                ? "Enter the new password twice. The old one stops working right away, so let the client know."
                : "The client will need this password to see their dashboard. Enter it twice."}
            </p>
            <label>
              New password
              <input type="text" autoComplete="off" value={pw} onChange={(e) => { setPw(e.target.value); setError(""); }} autoFocus />
            </label>
            <label>
              Type it again
              <input type="text" autoComplete="off" value={pw2} onChange={(e) => { setPw2(e.target.value); setError(""); }} />
            </label>
            {error && <p className="link-dialog-error">{error}</p>}
            <div className="link-dialog-actions">
              <span style={{ flex: 1 }} />
              <button type="button" className="mini-btn" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="mini-btn primary" disabled={saving}>
                {saving ? "Saving…" : hasPassword ? "Change password" : "Turn on password"}
              </button>
            </div>
          </form>
        )}
        {step === "off" && (
          <>
            <p className="email-hint">
              Turn off the password? Anyone with the link will be able to see this dashboard without one.
            </p>
            <div className="link-dialog-actions">
              <span style={{ flex: 1 }} />
              <button type="button" className="mini-btn" onClick={() => setStep("menu")}>
                Cancel
              </button>
              <button type="button" className="mini-btn danger-solid" disabled={saving} onClick={() => onSave("")}>
                {saving ? "Saving…" : "Yes, turn it off"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Turns a hex accent color into the 3 shades the stylesheet expects
// (base / a darker "strong" shade for text & headings / a very light
// tint for subtle backgrounds), so picking one brand color is enough
// to re-theme the whole dashboard -- no separate "pick 3 colors" UI.
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || "").trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}
function mix(hex, target, amount) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const mixed = rgb.map((c, i) => Math.round(c + (target[i] - c) * amount));
  return `rgb(${mixed.join(",")})`;
}
// `isDark` is the *resolved* light/dark state from useTheme() below --
// true for an explicit "Dark" choice, or "Auto" while the system is in
// dark mode. Two different jobs, on purpose:
//
// --brand-solid / --brand-solid-strong are for a *solid* colored
// surface that always carries fixed white text on top (the masthead
// gradient, see .masthead in globals.css) -- these stay the client's
// literal chosen color and its darkened partner in every theme, full
// stop, the same way a real printed logo doesn't get lighter at night.
//
// --brand / --brand-strong / --brand-tint are for *text and tinted
// backgrounds* elsewhere on the page (the active nav link, an eyebrow
// label, an event date, a due-soon chip...) sitting on top of the
// page's own light-or-dark surface color. Before this split, these
// were computed once, the same way, regardless of theme -- which
// happened to look fine in light mode (a darkened accent reads fine on
// a light surface) but meant dark mode got the *exact same* dark,
// low-contrast text color sitting on its own now-dark surface, which
// is most of what made dark mode "hard to read" in the first place.
function brandVars(accentColor, isDark, buttonColor) {
  const rgb = hexToRgb(accentColor);
  if (!rgb) return {};
  const btn = hexToRgb(buttonColor) ? buttonColor : accentColor;
  return {
    // Call-to-action buttons: their own brand color (meta.buttonColor).
    "--cta-bg": btn,
    "--cta-bg-strong": mix(btn, [0, 0, 0], 0.28),
    "--cta-text": contrastText(btn),
    "--brand-solid": accentColor,
    "--brand-solid-strong": mix(accentColor, [0, 0, 0], 0.28),
    "--brand": isDark ? mix(accentColor, [255, 255, 255], 0.55) : accentColor,
    "--brand-strong": isDark ? mix(accentColor, [255, 255, 255], 0.72) : mix(accentColor, [0, 0, 0], 0.28),
    "--brand-tint": isDark ? mix(accentColor, [0, 0, 0], 0.8) : mix(accentColor, [255, 255, 255], 0.88),
    // Readable text on top of a solid accent-color button (white on a
    // dark accent, near-black on a light one like yellow).
    "--brand-solid-text": contrastText(accentColor),
    // A thin light ring so a dark accent button still stands out
    // against dark mode's dark surface.
    "--cta-ring": isDark ? "0 0 0 1px rgba(255,255,255,.35)" : "0 0 0 0 transparent",
  };
}

// Picks readable black-or-white text for an arbitrary background color
// -- used by the store spotlight tag, whose background is a free color
// picker (see renderStores), so there's no fixed palette to hand-pick
// a matching text color from.
function contrastText(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#232420";
  const [r, g, b] = rgb;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#232420" : "#ffffff";
}

// Stores saved before the tag color picker existed have a `cls` of
// "event" / "needs" / "steady" and no `tagColor` -- these are this
// dashboard's actual former badge colors (light mode), so an old
// store's badge looks the same as before until someone opens the
// color picker and changes it.
const CLS_DEFAULT_COLOR = { event: "#e4ede6", needs: "#faf1de", steady: "#efece2" };
function storeTagColor(store) {
  return store.tagColor || CLS_DEFAULT_COLOR[store.cls] || "#efece2";
}

// Resizes/compresses an uploaded image client-side before it's stored
// as a data: URI in the dashboard's content JSON -- keeps a client
// logo from ballooning the saved payload. Returns a data URL.
function fileToLogoDataUrl(file, maxDim = 220) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Couldn't read that image."));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function Dashboard({
  client,
  isStaff,
  canRespond = isStaff,
  // Weekly / Monthly tabs and drafts -- all owned by ClientDashboard,
  // which remounts this component whenever the tab or mode changes.
  view = "weekly",
  mode = "live", // "live" | "draft" | "preview" | "empty"
  hasMonthly = false,
  draftViews = {},
  weeklyLive = null,
  onSwitchView,
  onDraftAction,
  onTogglePreview,
  onSaved,
  onDirtyChange,
  openEmailOnMount = false,
}) {
  const [content, setContent] = useState(client.content);
  // What's on the server for this tab+mode, to tell whether there are
  // unsaved edits (warns before leaving / switching tabs / publishing).
  const [savedContent, setSavedContent] = useState(client.content);
  const dirty = useMemo(() => JSON.stringify(content) !== JSON.stringify(savedContent), [content, savedContent]);
  useEffect(() => {
    onDirtyChange?.(dirty);
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, onDirtyChange]);
  const canEdit = isStaff && (mode === "live" || mode === "draft");
  const [presenting, setPresenting] = useState(false);
  const [emailOpen, setEmailOpen] = useState(openEmailOnMount);
  const [historyOpen, setHistoryOpen] = useState(false);

  // ---------------------------------------------------------------
  // Undo. A simple linear history of *previous* content snapshots --
  // every edit (a text commit, an add/remove, a reorder, a format
  // change) pushes the content as it was just before that edit, and
  // undo pops the most recent one back. There's no redo stack; the
  // user only asked for undo. Scoped to edits made in edit mode --
  // saving (which just re-syncs with the server's echo of what was
  // sent) and a client's own portal approvals don't touch this.
  // ---------------------------------------------------------------
  const historyRef = useRef([]);
  const [undoCount, setUndoCount] = useState(0);
  const updateContent = useCallback((updater) => {
    setContent((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (next !== prev) {
        historyRef.current.push(prev);
        if (historyRef.current.length > 60) historyRef.current.shift();
        setUndoCount(historyRef.current.length);
      }
      return next;
    });
  }, []);
  const undo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (prev === undefined) return;
    setUndoCount(historyRef.current.length);
    setContent(prev);
  }, []);

  // ---------------------------------------------------------------
  // Field selection, for the top-of-page format bar. `selectedFields`
  // is the array of dot-paths currently selected -- a plain click into
  // a field resets it to just that one path (see RichEditable's
  // onFocus); shift-clicking additional fields adds them, for
  // formatting several boxes at once. `fieldNodesRef` is how the
  // toolbar reaches a selected field's live DOM node even when it
  // isn't the one currently focused -- see runOnTargets below.
  // ---------------------------------------------------------------
  const fieldNodesRef = useRef(new Map());
  const [selectedFields, setSelectedFields] = useState([]);
  const registerNode = useCallback((path, node) => {
    if (node) fieldNodesRef.current.set(path, node);
    else fieldNodesRef.current.delete(path);
  }, []);
  const selectOnly = useCallback((path) => {
    setSelectedFields((prev) => (prev.length === 1 && prev[0] === path ? prev : [path]));
  }, []);
  const toggleSelect = useCallback((path) => {
    setSelectedFields((prev) => (prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]));
  }, []);
  // When the toolbar applies a bulk format across several selected
  // boxes (see runOnTargets), it has to programmatically .focus() each
  // node in turn -- which would otherwise cascade into each one's own
  // onFocus resetting the selection down to just that one box (so a
  // second toolbar click right after, e.g. also making the same
  // multi-selection green, would only hit the last box touched). This
  // flag tells RichEditable's onFocus to skip that reset while a bulk
  // operation is in progress.
  const suppressAutoSelectRef = useRef(false);
  // Links & buttons: the add/edit form (linkDialog) and the Open / Edit
  // / Remove menu for a link clicked while editing (linkMenu).
  const [linkDialog, setLinkDialog] = useState(null);
  const [linkMenu, setLinkMenu] = useState(null);
  const fieldActions = useMemo(
    () => ({
      registerNode,
      selectOnly: (path) => {
        if (!suppressAutoSelectRef.current) selectOnly(path);
      },
      toggleSelect,
      openLinkMenu: (info) => setLinkMenu(info),
    }),
    [registerNode, selectOnly, toggleSelect]
  );

  // The single source of truth for "what's on the page, in what order"
  // -- and, expanded below, for the sidebar menu too, so adding,
  // removing, or reordering a section always keeps the page and the
  // menu in lockstep instead of needing to be wired up twice.
  const sectionOrder =
    mode === "empty"
      ? []
      : content.sectionOrder && content.sectionOrder.length
      ? content.sectionOrder
      : DEFAULT_SECTION_ORDER;
  const customSectionsById = Object.fromEntries((content.customSections || []).map((c) => [c.id, c]));
  // reviewQuestions is one draggable block but renders two separate
  // anchors ("Ready for Review" and "Questions & Requests"), so it's
  // the one id that expands into two menu rows instead of one.
  const navIds = sectionOrder.flatMap((id) => (id === "reviewQuestions" ? ["review", "questions"] : [id]));
  function navLabelFor(id) {
    const override = getPath(content, `nav.${id}`);
    if (override != null) return override;
    if (customSectionsById[id]) return customSectionsById[id].label;
    return NAV_SECTIONS.find((s) => s.id === id)?.label || "Untitled section";
  }

  const [accentColor, setAccentColor] = useState(client.accentColor || "#1f4d3a");
  // The client's brand palette (meta.brandColors), and which of its
  // colors is used for call-to-action buttons (meta.buttonColor) --
  // so a client's buttons can stand out in a different brand color
  // from the header. Older clients without a palette start with their
  // accent color plus two starter slots to fill in.
  const palette =
    Array.isArray(content.meta.brandColors) && content.meta.brandColors.length
      ? content.meta.brandColors
      : [accentColor, "#2563eb", "#d97706"];
  const buttonColor = /^#[0-9a-f]{6}$/i.test(content.meta.buttonColor || "") ? content.meta.buttonColor : accentColor;
  const { theme, isDark, setTheme } = useTheme();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const [activeSection, setActiveSection] = useState(navIds[0]);
  const [logoBusy, setLogoBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const logoInputRef = useRef(null);
  const photoInputRef = useRef(null);

  const toastTimer = useRef(null);
  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("editing", editing);
    return () => document.body.classList.remove("editing");
  }, [editing]);

  // Scrollspy: highlight the sidebar link for whichever section is
  // nearest the top of the viewport.
  useEffect(() => {
    const sections = navIds.map((id) => document.getElementById(id)).filter(Boolean);
    if (!sections.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 }
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
    // Re-attach whenever the set of sections actually on the page
    // changes (added, removed, or reordered), so a newly added section
    // gets scroll-spied too and a removed one's stale id is dropped.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content.sectionOrder, content.customSections]);

  // Ctrl/Cmd+Z, anywhere on the page while editing -- see the Undo
  // button in the top format bar for the other way to trigger this.
  useEffect(() => {
    if (!editing) return undefined;
    function onKeyDown(e) {
      const key = e.key ? e.key.toLowerCase() : "";
      if ((e.metaKey || e.ctrlKey) && key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editing, undo]);

  const commit = useCallback(
    (path, value) => {
      updateContent((prev) => setPath(prev, path, value));
    },
    [updateContent]
  );

  const addItem = useCallback(
    (path, template) => {
      updateContent((prev) => pushAt(prev, path, template()));
    },
    [updateContent]
  );

  const removeItem = useCallback(
    (path, idx) => {
      updateContent((prev) => removeAt(prev, path, idx));
    },
    [updateContent]
  );

  const reorder = useCallback(
    (path, from, to) => {
      updateContent((prev) => setPath(prev, path, arrayMove(getPath(prev, path) || [], from, to)));
    },
    [updateContent]
  );

  function reorderSections(from, to) {
    updateContent((prev) => {
      const cur = prev.sectionOrder && prev.sectionOrder.length ? prev.sectionOrder : DEFAULT_SECTION_ORDER;
      return { ...prev, sectionOrder: arrayMove(cur, from, to) };
    });
  }

  // Removing a section (built-in or custom) from the page and the menu
  // together is just dropping its id from sectionOrder -- the render
  // list below already skips any id it doesn't have a renderer for, and
  // the sidebar nav is built from this same array (see the nav list
  // render), so both update in one step, automatically. For a built-in
  // section this is non-destructive: its underlying content (e.g.
  // content.recap) is untouched, so "+ Add section" can bring it right
  // back with everything still there. A custom section's own data is
  // deleted along with it, since there's nowhere else for it to live.
  function removeSection(id) {
    updateContent((prev) => {
      const cur = prev.sectionOrder && prev.sectionOrder.length ? prev.sectionOrder : DEFAULT_SECTION_ORDER;
      const next = { ...prev, sectionOrder: cur.filter((s) => s !== id) };
      if (prev.customSections?.some((c) => c.id === id)) {
        next.customSections = prev.customSections.filter((c) => c.id !== id);
      }
      return next;
    });
  }

  // Brings a hidden built-in section back at the end of the page/menu.
  function addBuiltinSection(id) {
    updateContent((prev) => {
      const cur = prev.sectionOrder && prev.sectionOrder.length ? prev.sectionOrder : DEFAULT_SECTION_ORDER;
      if (cur.includes(id)) return prev;
      return { ...prev, sectionOrder: [...cur, id] };
    });
  }

  // Creates a brand-new section and wires it into the menu in the same
  // step -- there's no separate "connect this to the header" action,
  // because the id that goes on sectionOrder here is the exact id the
  // section renders itself under and the nav anchors to.
  function addCustomSection() {
    updateContent((prev) => {
      const section = ITEM_TEMPLATES.customSection();
      const cur = prev.sectionOrder && prev.sectionOrder.length ? prev.sectionOrder : DEFAULT_SECTION_ORDER;
      return {
        ...prev,
        customSections: [...(prev.customSections || []), section],
        sectionOrder: [...cur, section.id],
      };
    });
  }

  // ---------------------------------------------------------------
  // The top format bar's actual work: run a formatting mutation against
  // every currently-selected field's live DOM node, then commit each
  // one's resulting HTML back into content.
  //
  // For a single field that's genuinely focused with its own live text
  // selection (the normal "highlight a word, click Bold" case), that
  // selection is left exactly as the user made it -- execCommand just
  // acts on it. Otherwise (a field selected only via shift-click, never
  // focused; or more than one field selected at once) there's no
  // meaningful partial-text selection to preserve, so each node is
  // focused and its *entire* contents are selected in turn, immediately
  // before the mutation runs on it -- the browser only ever has one
  // live selection at a time, so this has to happen one node at a time,
  // not "select everything, then mutate everything."
  // ---------------------------------------------------------------
  function runOnTargets(mutate) {
    const targets = selectedFields
      .map((path) => ({ path, node: fieldNodesRef.current.get(path) }))
      .filter((t) => t.node);
    if (!targets.length) {
      showToast("Click a text box first, then use the toolbar");
      return;
    }
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    const soleFocused =
      targets.length === 1 &&
      document.activeElement === targets[0].node &&
      sel &&
      sel.rangeCount > 0 &&
      targets[0].node.contains(sel.getRangeAt(0).commonAncestorContainer);

    suppressAutoSelectRef.current = true;
    try {
      targets.forEach(({ node }) => {
        if (!soleFocused) {
          node.focus();
          const s = window.getSelection();
          s.removeAllRanges();
          const range = document.createRange();
          range.selectNodeContents(node);
          s.addRange(range);
        }
        mutate(node);
      });
    } finally {
      suppressAutoSelectRef.current = false;
    }
    targets.forEach(({ path, node }) => commit(path, serializeField(node)));
  }

  // ---------------------------------------------------------------
  // Links & buttons from the format bar. Both work on exactly one text
  // box: the highlighted text becomes the link (or is replaced by the
  // button); with nothing highlighted, the link/button goes in at the
  // cursor, or at the end of a box that was only shift-click selected.
  // The selection is saved before the form opens (typing in the form
  // moves focus away from the box) and restored when it's submitted.
  // ---------------------------------------------------------------
  function startInsert(mode) {
    if (selectedFields.length !== 1) {
      showToast(selectedFields.length ? "Select just one text box to add a link" : "Click into a text box first, then add a link");
      return;
    }
    const path = selectedFields[0];
    const node = fieldNodesRef.current.get(path);
    if (!node) return;
    const sel = window.getSelection();
    let range = null;
    if (sel && sel.rangeCount > 0 && node.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      range = sel.getRangeAt(0).cloneRange();
    }
    const selectedText = range ? range.toString().trim() : "";
    setLinkDialog({ mode, path, node, range, initial: { label: selectedText, url: "" } });
  }

  function placeRange(node, saved) {
    node.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    let range = saved;
    if (!range || !node.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(false);
    }
    sel.addRange(range);
    return range;
  }

  function submitLinkDialog({ label, url, color }) {
    const d = linkDialog;
    setLinkDialog(null);
    if (!d) return;
    if (d.mode === "card") {
      commit(`${d.cardPath}.link`, color ? { label, url, color } : { label, url });
      return;
    }
    const { node, path } = d;
    if (d.anchor) {
      // Editing an existing link/button in place.
      d.anchor.setAttribute("href", url);
      const attrs = linkAttrs(url);
      ["target", "rel"].forEach((k) => (attrs[k] ? d.anchor.setAttribute(k, attrs[k]) : d.anchor.removeAttribute(k)));
      if (label) d.anchor.textContent = label;
      if (d.mode === "button") applyCtaColor(d.anchor, color);
      commit(path, serializeField(node));
      return;
    }
    const range = placeRange(node, d.range);
    let el;
    if (d.mode === "link") {
      el = makeLink(url, "", LINK_CLASS);
      if (!range.collapsed && (!label || label === range.toString().trim())) {
        // Keep the highlighted text (and any bold/color on it) as the link.
        el.appendChild(range.extractContents());
      } else {
        if (!range.collapsed) range.deleteContents();
        el.textContent = label || displayUrl(url);
      }
    } else {
      if (!range.collapsed) range.deleteContents();
      el = makeLink(url, label, CTA_CLASS);
      applyCtaColor(el, color);
    }
    range.insertNode(el);
    // A space after the new link/button (unless one's already there),
    // so typing on doesn't extend the link.
    let after = el.nextSibling;
    if (!(after && after.nodeType === 3 && /^\s/.test(after.nodeValue))) {
      after = document.createTextNode("\u00a0");
      el.after(after);
    }
    const sel = window.getSelection();
    const caret = document.createRange();
    caret.setStart(after, 1);
    caret.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caret);
    decorateField(node, true);
    commit(path, serializeField(node));
  }

  function editMenuLink() {
    const m = linkMenu;
    setLinkMenu(null);
    if (!m) return;
    const isButton = m.anchor.classList.contains(CTA_CLASS);
    setLinkDialog({
      mode: isButton ? "button" : "link",
      path: m.path,
      node: m.node,
      anchor: m.anchor,
      initial: {
        label: m.anchor.textContent,
        url: m.anchor.getAttribute("href") || "",
        color: isButton ? rgbToHex(m.anchor.style.backgroundColor) : "",
        editing: true,
      },
    });
  }

  function removeMenuLink() {
    const m = linkMenu;
    setLinkMenu(null);
    if (!m) return;
    if (m.anchor.classList.contains(CTA_CLASS)) {
      m.anchor.remove();
    } else {
      m.anchor.replaceWith(...m.anchor.childNodes);
    }
    commit(m.path, serializeField(m.node));
  }

  function removeDialogLink() {
    const d = linkDialog;
    setLinkDialog(null);
    if (!d) return;
    if (d.mode === "card") {
      commit(`${d.cardPath}.link`, undefined);
      return;
    }
    if (d.anchor) {
      if (d.anchor.classList.contains(CTA_CLASS)) d.anchor.remove();
      else d.anchor.replaceWith(...d.anchor.childNodes);
      commit(d.path, serializeField(d.node));
    }
  }

  // A card's own button (item.link): opens the same form in "card" mode.
  function cardLinkProps(itemPath, link) {
    return {
      link,
      editing,
      onEdit: () =>
        setLinkDialog({
          mode: "card",
          cardPath: itemPath,
          initial: { label: link?.label || "", url: link?.url || "", color: link?.color || "", editing: !!link?.url },
        }),
      onRemove: () => commit(`${itemPath}.link`, undefined),
    };
  }

  const applyBold = () => runOnTargets(() => document.execCommand("bold", false, null));
  const applyItalic = () => runOnTargets(() => document.execCommand("italic", false, null));
  const applyUnderline = () => runOnTargets(() => document.execCommand("underline", false, null));

  // Alignment is a whole-field property (these are single-block fields,
  // not multi-paragraph documents), so rather than lean on execCommand's
  // inconsistent block-alignment behavior, wrap the field's entire
  // content in one <div style="text-align:...">, updating it in place
  // on repeated clicks instead of nesting.
  function applyAlign(align) {
    runOnTargets((node) => {
      const first = node.firstElementChild;
      const isWrapper =
        node.children.length === 1 &&
        first &&
        first.tagName === "DIV" &&
        /text-align\s*:/.test(first.getAttribute("style") || "");
      if (isWrapper) {
        first.style.textAlign = align;
      } else {
        node.innerHTML = `<div style="text-align:${align}">${node.innerHTML}</div>`;
      }
    });
  }

  // Font size on a selection has to go through execCommand -- there's
  // no other reliable way to wrap an arbitrary mid-text selection.
  // execCommand("fontSize") only understands the legacy 1-7 scale and
  // produces <font size="7"> elements, so those are immediately swapped
  // for <span style="font-size:...">, which is what the sanitizer and
  // every other renderer here expects.
  function applyFontSize(px) {
    runOnTargets((node) => {
      document.execCommand("fontSize", false, "7");
      node.querySelectorAll('font[size="7"]').forEach((f) => {
        const span = document.createElement("span");
        span.style.fontSize = px;
        span.innerHTML = f.innerHTML;
        f.replaceWith(span);
      });
    });
  }

  // Same pattern: execCommand("foreColor") is the only reliable way to
  // wrap an arbitrary mid-text selection, producing a legacy
  // <font color="..."> that's immediately swapped for
  // <span style="color:...">.
  function applyColor(hex) {
    runOnTargets((node) => {
      document.execCommand("foreColor", false, hex);
      node.querySelectorAll("font[color]").forEach((f) => {
        const span = document.createElement("span");
        span.style.color = f.getAttribute("color");
        span.innerHTML = f.innerHTML;
        f.replaceWith(span);
      });
    });
  }

  // Background color for a text box -- "hiliteColor" is the
  // execCommand for this (foreColor is text color); different engines
  // wrap the selection differently (a <font style="...">, or already a
  // <span style="background-color:...">), so this normalizes whatever
  // comes out into the same <span style="background-color:...">
  // shape as everything else here.
  function applyBgColor(hex) {
    runOnTargets((node) => {
      document.execCommand("hiliteColor", false, hex);
      node.querySelectorAll("font[style]").forEach((f) => {
        const span = document.createElement("span");
        span.style.backgroundColor = hex;
        span.innerHTML = f.innerHTML;
        f.replaceWith(span);
      });
    });
  }
  const applyClearBg = () => applyBgColor("transparent");

  // Shared by the client-logo uploader and the Marketing Strategist
  // headshot uploader -- both just resize an image client-side into a
  // data: URI and commit it at a given content path.
  async function handleImageUpload(e, path, { maxDim, busyLabel, setBusy } = {}) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Please choose an image file");
      return;
    }
    const setBusyFn = setBusy || setLogoBusy;
    setBusyFn(true);
    try {
      const dataUrl = await fileToLogoDataUrl(file, maxDim);
      commit(path, dataUrl);
      showToast(`${busyLabel || "Image"} added -- remember to save`);
    } catch (err) {
      showToast(err.message || "Couldn't add that image");
    } finally {
      setBusyFn(false);
    }
  }
  const handleLogoUpload = (e) =>
    handleImageUpload(e, "meta.clientLogo", { maxDim: 220, busyLabel: "Logo", setBusy: setLogoBusy });
  const handlePhotoUpload = (e) =>
    handleImageUpload(e, "meta.contactPhoto", { maxDim: 320, busyLabel: "Photo", setBusy: setPhotoBusy });

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${client.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          view,
          target: mode === "draft" ? "draft" : "live",
          content: { ...content, meta: { ...content.meta, updatedAt: new Date().toISOString() } },
          accentColor,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed (${res.status})`);
      }
      const { saved, client: updatedClient } = await res.json();
      setContent(saved);
      setSavedContent(saved);
      onSaved?.(updatedClient);
      showToast(mode === "draft" ? "Draft saved -- the client still sees the published version" : "Saved");
    } catch (err) {
      showToast(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // The client portal password lives on the Client record, not in
  // `content` -- it's set here, separately from "Save changes", and
  // (per lib/db.js's toSafeClient) the current value is never sent to
  // the browser, so this field is always write-only: typing something
  // and saving *changes* the password, it never displays it.
  const [hasPassword, setHasPassword] = useState(!!client.hasClientPassword);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  async function savePortalPassword(nextPassword) {
    setSavingPassword(true);
    try {
      const res = await fetch(`/api/clients/${client.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientPassword: nextPassword }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Couldn't save that.");
      }
      setHasPassword(!!nextPassword);
      setPasswordOpen(false);
      showToast(nextPassword ? "Portal password set" : "Portal password turned off");
    } catch (err) {
      showToast(err.message || "Couldn't save that.");
    } finally {
      setSavingPassword(false);
    }
  }

  // The client-facing approve/needs-edits control (see ApprovalWidget)
  // saves immediately through its own narrow API route rather than
  // through the staff "Save changes" flow -- a client viewing their
  // portal never sees or uses that button.
  async function respond(path, value) {
    // In a draft, a status click is just part of the draft (saved with
    // "Save changes"); clients only ever respond on the published page.
    if (mode === "draft") {
      commit(path, value);
      return;
    }
    if (mode !== "live") return;
    try {
      const res = await fetch(`/api/clients/${client.slug}/respond`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, value, view }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Couldn't save that.");
      }
      // Update just that one field locally, so a staff member's
      // unsaved edits elsewhere on the page aren't wiped out.
      setContent((prev) => setPath(prev, path, value));
      setSavedContent((prev) => setPath(prev, path, value));
    } catch (err) {
      showToast(err.message || "Couldn't save that.");
    }
  }

  // A real date *and* time, not just a day -- this gets updated far
  // more often than "monthly" now (approvals, formatting tweaks,
  // content edits), so a bare date invites the same stale-sounding
  // claim the old static footer text made. Used in both the sidebar
  // and the footer, from the one saved meta.updatedAt timestamp (set
  // whenever "Save changes" runs -- see handleSave), so it's always
  // the actual last-save moment, never hand-typed.
  const updatedLabel = useMemo(() => {
    try {
      return new Date(content.meta.updatedAt).toLocaleString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }, [content.meta.updatedAt]);

  // ---------------------------------------------------------------
  // One render function per top-level section. Pulled out so they can
  // be reordered as a data-driven list (content.sectionOrder) instead
  // of a fixed block of JSX -- see the section-list render near the
  // bottom of this component.
  // ---------------------------------------------------------------

  function renderRecap() {
    return (
      <section id="recap" className="section">
        <div className="section-head">
          <div>
            <RichEditable as="span" className="eyebrow" value={content.recap.eyebrow} path="recap.eyebrow" editing={editing} onCommit={commit} />
            <RichEditable as="h2" value={content.recap.heading} path="recap.heading" editing={editing} onCommit={commit} />
          </div>
          <RichEditable as="p" className="section-note" value={content.recap.note} path="recap.note" editing={editing} onCommit={commit} />
        </div>

        <SortableGroup
          idPrefix="recap.stats"
          items={content.recap.stats}
          onReorder={(from, to) => reorder("recap.stats", from, to)}
          disabled={!editing}
          listClassName="glance-grid"
          rowClassName="stat-tile"
        >
          {(stat, i) => (
            <>
              {editing && <RemoveBtn onClick={() => removeItem("recap.stats", i)} />}
              <RichEditable as="div" className="stat-label" value={stat.label} path={`recap.stats.${i}.label`} editing={editing} onCommit={commit} />
              <RichEditable as="div" className="stat-value" value={stat.value} path={`recap.stats.${i}.value`} editing={editing} onCommit={commit} />
              <RichEditable
                as="div"
                className={`stat-sub${stat.good ? " good" : ""}`}
                value={stat.sub}
                path={`recap.stats.${i}.sub`}
                editing={editing}
                onCommit={commit}
              />
            </>
          )}
        </SortableGroup>
        {editing && (
          <div style={{ marginTop: 10 }}>
            <AddBtn label="Add stat" onClick={() => addItem("recap.stats", ITEM_TEMPLATES.statItem)} />
          </div>
        )}

        {(content.recap.footnote.length > 0 || editing) && (
          <div className="glance-footnote">
            {content.recap.footnote.map((note, i) => (
              <span className="foot-pill" key={i}>
                <RichEditable as="span" value={note} path={`recap.footnote.${i}`} editing={editing} onCommit={commit} />
                {editing && <RemoveBtn onClick={() => removeItem("recap.footnote", i)} />}
              </span>
            ))}
            {editing && <AddBtn label="Add note" onClick={() => addItem("recap.footnote", ITEM_TEMPLATES.footnoteItem)} />}
          </div>
        )}
      </section>
    );
  }

  function renderMomentum() {
    return (
      <section id="momentum" className="section">
        <div className="section-head">
          <div>
            <RichEditable as="span" className="eyebrow" value={getPath(content, "headings.momentum.eyebrow") ?? "Momentum"} path="headings.momentum.eyebrow" editing={editing} onCommit={commit} />
            <RichEditable as="h2" value={getPath(content, "headings.momentum.heading") ?? "What's been moving"} path="headings.momentum.heading" editing={editing} onCommit={commit} />
          </div>
        </div>
        <SortableGroup
          idPrefix="momentum.items"
          items={content.momentum.items}
          onReorder={(from, to) => reorder("momentum.items", from, to)}
          disabled={!editing}
          listClassName="momentum-grid"
          rowClassName="momentum-card"
        >
          {(m, i) => (
            <>
              <div className="card-top-row">
                <RichEditable as="span" className="momentum-month" value={m.month} path={`momentum.items.${i}.month`} editing={editing} onCommit={commit} />
                {editing && <RemoveBtn onClick={() => removeItem("momentum.items", i)} />}
              </div>
              <RichEditable as="p" value={m.text} path={`momentum.items.${i}.text`} editing={editing} onCommit={commit} />
            </>
          )}
        </SortableGroup>
        {editing && <div style={{ marginTop: 10 }}><AddBtn label="Add highlight" onClick={() => addItem("momentum.items", ITEM_TEMPLATES.momentumItem)} /></div>}
      </section>
    );
  }

  function renderStores() {
    return (
      <section id="stores" className="section">
        <div className="section-head">
          <div>
            <RichEditable as="span" className="eyebrow" value={getPath(content, "headings.stores.eyebrow") ?? "Store Spotlights"} path="headings.stores.eyebrow" editing={editing} onCommit={commit} />
            <RichEditable as="h2" value={getPath(content, "headings.stores.heading") ?? "Location-by-location notes"} path="headings.stores.heading" editing={editing} onCommit={commit} />
          </div>
        </div>
        <SortableGroup
          idPrefix="stores.items"
          items={content.stores.items}
          onReorder={(from, to) => reorder("stores.items", from, to)}
          disabled={!editing}
          listClassName="store-grid"
          rowClassName="store-card"
        >
          {(store, i) => (
            <>
              <div className="store-card-top">
                <RichEditable as="span" className="store-name" value={store.name} path={`stores.items.${i}.name`} editing={editing} onCommit={commit} />
                <div className="store-tag-group">
                  <span className="store-tag" style={{ background: storeTagColor(store), color: contrastText(storeTagColor(store)) }}>
                    <Editable value={store.tag} path={`stores.items.${i}.tag`} editing={editing} onCommit={commit} />
                  </span>
                  {editing && (
                    <input
                      type="color"
                      className="tag-color-input edit-ctl"
                      title="Badge color"
                      value={storeTagColor(store)}
                      onChange={(e) => commit(`stores.items.${i}.tagColor`, e.target.value)}
                    />
                  )}
                  {editing && <RemoveBtn onClick={() => removeItem("stores.items", i)} />}
                </div>
              </div>
              <RichEditable as="p" value={store.text} path={`stores.items.${i}.text`} editing={editing} onCommit={commit} />
            </>
          )}
        </SortableGroup>
        {editing && <div style={{ marginTop: 10 }}><AddBtn label="Add store" onClick={() => addItem("stores.items", ITEM_TEMPLATES.storeItem)} /></div>}
      </section>
    );
  }

  function renderReviewQuestions() {
    return (
      <div className="two-col" style={{ marginTop: 52 }}>
        <section id="review" className="section" style={{ marginTop: 0 }}>
          <div className="panel">
            <div className="panel-head">
              <RichEditable as="h3" value={getPath(content, "headings.review.heading") ?? "Ready for Your Review"} path="headings.review.heading" editing={editing} onCommit={commit} />
              <span className="count-badge">
                {content.review.groups.reduce((n, g) => n + g.items.length, 0)}
              </span>
            </div>
            {content.review.groups.map((group, gi) => (
              <div key={gi}>
                <div className="review-group-label">
                  <RichEditable as="span" value={group.label} path={`review.groups.${gi}.label`} editing={editing} onCommit={commit} />
                  {editing && (
                    <button type="button" className="rm-btn edit-ctl" onClick={() => removeItem("review.groups", gi)} aria-label="Remove group">
                      &times;
                    </button>
                  )}
                </div>
                <SortableGroup
                  idPrefix={`review.groups.${gi}.items`}
                  items={group.items}
                  onReorder={(from, to) => reorder(`review.groups.${gi}.items`, from, to)}
                  disabled={!editing}
                  rowClassName="review-item"
                >
                  {(item, ii) => (
                    <>
                      <div className="review-item-top">
                        <div>
                          <RichEditable as="span" className="review-item-title" value={item.title} path={`review.groups.${gi}.items.${ii}.title`} editing={editing} onCommit={commit} />
                          <RichEditable as="div" className="review-item-store" value={item.store} path={`review.groups.${gi}.items.${ii}.store`} editing={editing} onCommit={commit} />
                        </div>
                        {editing && <RemoveBtn onClick={() => removeItem(`review.groups.${gi}.items`, ii)} />}
                      </div>
                      <RichEditable as="div" className="review-item-desc" value={item.desc} path={`review.groups.${gi}.items.${ii}.desc`} editing={editing} onCommit={commit} />
                      <CardLink {...cardLinkProps(`review.groups.${gi}.items.${ii}`, item.link)} />
                      <ApprovalWidget
                        status={item.status}
                        comment={item.clientComment}
                        canRespond={canRespond}
                        onStatusChange={(s) => respond(`review.groups.${gi}.items.${ii}.status`, s)}
                        onCommentCommit={(c) => respond(`review.groups.${gi}.items.${ii}.clientComment`, c)}
                      />
                    </>
                  )}
                </SortableGroup>
                {editing && (
                  <div className="add-item-row">
                    <AddBtn label="Add item" onClick={() => addItem(`review.groups.${gi}.items`, ITEM_TEMPLATES.reviewItem)} />
                  </div>
                )}
              </div>
            ))}
            {editing && (
              <div className="add-item-row">
                <AddBtn label="Add deadline group" onClick={() => addItem("review.groups", ITEM_TEMPLATES.reviewGroup)} />
              </div>
            )}
          </div>
        </section>

        <section id="questions" className="section" style={{ marginTop: 0 }}>
          <div className="panel">
            <div className="panel-head">
              <RichEditable as="h3" value={getPath(content, "headings.questions.heading") ?? "Questions & Requests"} path="headings.questions.heading" editing={editing} onCommit={commit} />
              <span className="count-badge">{content.questions.items.length}</span>
            </div>
            <SortableGroup
              idPrefix="questions.items"
              items={content.questions.items}
              onReorder={(from, to) => reorder("questions.items", from, to)}
              disabled={!editing}
              rowClassName="question-item"
            >
              {(q, i) => (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <RichEditable as="span" className="question-store" value={q.store} path={`questions.items.${i}.store`} editing={editing} onCommit={commit} />
                    {editing && <RemoveBtn onClick={() => removeItem("questions.items", i)} />}
                  </div>
                  <RichEditable as="div" className="question-title" value={q.title} path={`questions.items.${i}.title`} editing={editing} onCommit={commit} />
                  {(q.excerpt || editing) && (
                    <RichEditable as="div" className="question-excerpt" value={q.excerpt} path={`questions.items.${i}.excerpt`} editing={editing} onCommit={commit} />
                  )}
                  {(q.response || editing) && (
                    <RichEditable as="div" className="question-response" value={q.response} path={`questions.items.${i}.response`} editing={editing} onCommit={commit} />
                  )}
                  <CardLink {...cardLinkProps(`questions.items.${i}`, q.link)} />
                  <ApprovalWidget
                    status={q.status}
                    comment={q.clientComment}
                    canRespond={canRespond}
                    onStatusChange={(s) => respond(`questions.items.${i}.status`, s)}
                    onCommentCommit={(c) => respond(`questions.items.${i}.clientComment`, c)}
                  />
                </>
              )}
            </SortableGroup>
            {editing && (
              <div className="add-item-row">
                <AddBtn label="Add question" onClick={() => addItem("questions.items", ITEM_TEMPLATES.questionItem)} />
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  function renderWorking() {
    return (
      <section id="working" className="section">
        <div className="section-head">
          <div>
            <RichEditable as="span" className="eyebrow" value={getPath(content, "headings.working.eyebrow") ?? "In Progress"} path="headings.working.eyebrow" editing={editing} onCommit={commit} />
            <RichEditable as="h2" value={getPath(content, "headings.working.heading") ?? "What we're working on"} path="headings.working.heading" editing={editing} onCommit={commit} />
          </div>
        </div>
        <div className="work-grid">
          {content.working.columns.map((col, ci) => (
            <div className="work-col" key={ci}>
              <RichEditable as="h4" value={col.label} path={`working.columns.${ci}.label`} editing={editing} onCommit={commit} />
              <SortableGroup
                idPrefix={`working.columns.${ci}.items`}
                items={col.items}
                onReorder={(from, to) => reorder(`working.columns.${ci}.items`, from, to)}
                disabled={!editing}
                as="ul"
                listClassName="work-list"
                rowAs="li"
              >
                {(item, ii) => (
                  <>
                    <span className="work-check">
                      <CheckIcon />
                    </span>
                    <RichEditable as="span" className="work-item-text" value={item} path={`working.columns.${ci}.items.${ii}`} editing={editing} onCommit={commit} />
                    {editing && <RemoveBtn onClick={() => removeItem(`working.columns.${ci}.items`, ii)} />}
                  </>
                )}
              </SortableGroup>
              {editing && <AddBtn label="Add task" onClick={() => addItem(`working.columns.${ci}.items`, ITEM_TEMPLATES.workingItem)} />}
            </div>
          ))}
        </div>
      </section>
    );
  }

  function renderApproved() {
    return (
      <section id="approved" className="section">
        <div className="section-head">
          <div>
            <RichEditable as="span" className="eyebrow" value={getPath(content, "headings.approved.eyebrow") ?? "Approved & Live"} path="headings.approved.eyebrow" editing={editing} onCommit={commit} />
            <RichEditable as="h2" value={getPath(content, "headings.approved.heading") ?? "Recently shipped"} path="headings.approved.heading" editing={editing} onCommit={commit} />
          </div>
        </div>
        <SortableGroup
          idPrefix="approved.items"
          items={content.approved.items}
          onReorder={(from, to) => reorder("approved.items", from, to)}
          disabled={!editing}
          listClassName="approved-strip"
          rowAs="span"
          rowClassName="approved-chip"
        >
          {(item, i) => (
            <>
              <span className="dot">
                <CheckIcon />
              </span>
              <RichEditable as="span" value={item} path={`approved.items.${i}`} editing={editing} onCommit={commit} />
              {editing && <RemoveBtn onClick={() => removeItem("approved.items", i)} />}
            </>
          )}
        </SortableGroup>
        {editing && <div style={{ marginTop: 10 }}><AddBtn label="Add" onClick={() => addItem("approved.items", ITEM_TEMPLATES.approvedItem)} /></div>}
      </section>
    );
  }

  function renderUpcoming() {
    return (
      <section id="upcoming" className="section">
        <div className="section-head">
          <div>
            <RichEditable as="span" className="eyebrow" value={getPath(content, "headings.upcoming.eyebrow") ?? "What's Ahead"} path="headings.upcoming.eyebrow" editing={editing} onCommit={commit} />
            <RichEditable as="h2" value={getPath(content, "headings.upcoming.heading") ?? "Events & meeting cadence"} path="headings.upcoming.heading" editing={editing} onCommit={commit} />
          </div>
        </div>
        <div className="upcoming-grid">
          <div className="panel panel-pad">
            <RichEditable as="h4" value={getPath(content, "headings.upcoming.events") ?? "Upcoming events"} path="headings.upcoming.events" editing={editing} onCommit={commit} />
            <SortableGroup
              idPrefix="events.items"
              items={content.events.items}
              onReorder={(from, to) => reorder("events.items", from, to)}
              disabled={!editing}
              rowClassName="event-row"
            >
              {(ev, i) => (
                <>
                  <div className="event-date">
                    <RichEditable as="div" className="num" value={ev.day} path={`events.items.${i}.day`} editing={editing} onCommit={commit} />
                    <RichEditable as="div" className="mon" value={ev.mon} path={`events.items.${i}.mon`} editing={editing} onCommit={commit} />
                  </div>
                  <div className="event-main">
                    <RichEditable as="span" className="event-title" value={ev.title} path={`events.items.${i}.title`} editing={editing} onCommit={commit} />
                    <RichEditable as="div" className="event-loc" value={ev.loc} path={`events.items.${i}.loc`} editing={editing} onCommit={commit} />
                    <CardLink {...cardLinkProps(`events.items.${i}`, ev.link)} />
                    <EventStatusWidget
                      status={ev.status}
                      comment={ev.clientComment}
                      canRespond={canRespond}
                      onStatusChange={(s) => respond(`events.items.${i}.status`, s)}
                      onCommentCommit={(c) => respond(`events.items.${i}.clientComment`, c)}
                    />
                  </div>
                  {editing && <RemoveBtn onClick={() => removeItem("events.items", i)} />}
                </>
              )}
            </SortableGroup>
            {editing && <div style={{ marginTop: 8 }}><AddBtn label="Add event" onClick={() => addItem("events.items", ITEM_TEMPLATES.eventItem)} /></div>}
          </div>
          <div className="panel panel-pad">
            <RichEditable as="h4" value={getPath(content, "headings.upcoming.meetings") ?? "Meeting cadence"} path="headings.upcoming.meetings" editing={editing} onCommit={commit} />
            <SortableGroup
              idPrefix="meetings.items"
              items={content.meetings.items}
              onReorder={(from, to) => reorder("meetings.items", from, to)}
              disabled={!editing}
              rowClassName="cadence-row"
            >
              {(m, i) => (
                <>
                  <div className="cadence-row-top">
                    <div>
                      <RichEditable as="span" className="cadence-name" value={m.name} path={`meetings.items.${i}.name`} editing={editing} onCommit={commit} />
                      <RichEditable as="div" className="cadence-freq" value={m.freq} path={`meetings.items.${i}.freq`} editing={editing} onCommit={commit} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <RichEditable as="span" className="cadence-next" value={m.next} path={`meetings.items.${i}.next`} editing={editing} onCommit={commit} />
                      {editing && <RemoveBtn onClick={() => removeItem("meetings.items", i)} />}
                    </div>
                  </div>
                  <CardLink {...cardLinkProps(`meetings.items.${i}`, m.link)} />
                  <EventStatusWidget
                    status={m.status}
                    comment={m.clientComment}
                    canRespond={canRespond}
                    onStatusChange={(s) => respond(`meetings.items.${i}.status`, s)}
                    onCommentCommit={(c) => respond(`meetings.items.${i}.clientComment`, c)}
                  />
                </>
              )}
            </SortableGroup>
            {editing && <div style={{ marginTop: 8 }}><AddBtn label="Add meeting" onClick={() => addItem("meetings.items", ITEM_TEMPLATES.meetingItem)} /></div>}
          </div>
        </div>
      </section>
    );
  }

  // A user-added section: a headline, an optional note, and an
  // orderable list of short cards. Its menu label is edited from the
  // sidebar nav list (like every built-in section's label), not here,
  // so there's exactly one place to rename it rather than two fields
  // that could drift out of sync.
  function renderCustom(section, idx) {
    return (
      <section id={section.id} className="section">
        <div className="section-head">
          <div>
            <RichEditable as="h2" value={section.heading} path={`customSections.${idx}.heading`} editing={editing} onCommit={commit} />
          </div>
          {(section.note || editing) && (
            <RichEditable as="p" className="section-note" value={section.note} path={`customSections.${idx}.note`} editing={editing} onCommit={commit} />
          )}
        </div>

        <SortableGroup
          idPrefix={`customSections.${idx}.items`}
          items={section.items}
          onReorder={(from, to) => reorder(`customSections.${idx}.items`, from, to)}
          disabled={!editing}
          listClassName="momentum-grid"
          rowClassName="momentum-card"
        >
          {(item, ii) => (
            <>
              {editing && <RemoveBtn onClick={() => removeItem(`customSections.${idx}.items`, ii)} />}
              <RichEditable as="p" value={item.text} path={`customSections.${idx}.items.${ii}.text`} editing={editing} onCommit={commit} />
              <CardLink {...cardLinkProps(`customSections.${idx}.items.${ii}`, item.link)} />
            </>
          )}
        </SortableGroup>
        {editing && (
          <div style={{ marginTop: 10 }}>
            <AddBtn label="Add card" onClick={() => addItem(`customSections.${idx}.items`, ITEM_TEMPLATES.customSectionItem)} />
          </div>
        )}
      </section>
    );
  }

  const customSections = content.customSections || [];
  const sectionRenderers = {
    recap: renderRecap,
    momentum: renderMomentum,
    stores: renderStores,
    reviewQuestions: renderReviewQuestions,
    working: renderWorking,
    approved: renderApproved,
    upcoming: renderUpcoming,
    ...Object.fromEntries(
      customSections.map((section, idx) => [section.id, () => renderCustom(section, idx)])
    ),
  };

  // Which built-in sections aren't currently on the page -- offered
  // back via "+ Add section" below rather than always shown, so
  // re-adding one is a single click instead of hunting for a hidden
  // toggle somewhere.
  const hiddenBuiltins = BUILTIN_SECTIONS.filter((s) => !sectionOrder.includes(s.id));

  return (
    <FieldActionsContext.Provider value={fieldActions}>
    <FieldSelectionContext.Provider value={selectedFields}>
    <div className="shell" style={brandVars(accentColor, isDark, buttonColor)}>
      {editing && (
        <FormatToolbar
          selectionCount={selectedFields.length}
          onClearSelection={() => setSelectedFields([])}
          onBold={applyBold}
          onItalic={applyItalic}
          onUnderline={applyUnderline}
          onAlign={applyAlign}
          onFontSize={applyFontSize}
          onColor={applyColor}
          onClearColor={() => applyColor("inherit")}
          onBgColor={applyBgColor}
          onClearBg={applyClearBg}
          onUndo={undo}
          canUndo={undoCount > 0}
          brandColors={palette}
          onLink={() => startInsert("link")}
          onButton={() => startInsert("button")}
        />
      )}
      {editing && linkDialog && (
        <LinkDialog
          mode={linkDialog.mode}
          initial={linkDialog.initial}
          palette={palette}
          defaultColor={buttonColor}
          onSubmit={submitLinkDialog}
          onCancel={() => setLinkDialog(null)}
          onRemove={linkDialog.initial?.editing ? removeDialogLink : undefined}
        />
      )}
      {editing && linkMenu && (
        <LinkMenu
          anchor={linkMenu.anchor}
          onOpen={() => {
            const href = safeUrl(linkMenu.anchor.getAttribute("href"));
            if (href) window.open(href, "_blank", "noopener,noreferrer");
            setLinkMenu(null);
          }}
          onEdit={editMenuLink}
          onRemove={removeMenuLink}
          onClose={() => setLinkMenu(null)}
        />
      )}
      {isStaff && (
        <button
          type="button"
          className="mobile-nav-toggle"
          onClick={() => setNavOpen((v) => !v)}
        >
          Menu
        </button>
      )}

      <aside className={`sidebar${navOpen ? " open" : ""}`}>
        <div className="side-brand">
          <div className="mark">
            <img src="/mojo-logo.png" alt="" width={18} height={18} />
          </div>
          <div className="side-title">
            Mountain Mojo
            <small>Client Dashboard</small>
          </div>
        </div>

        <ul className="side-nav">
          {navIds.map((id) => {
            const label = navLabelFor(id);
            const custom = customSectionsById[id];
            const editPath = custom
              ? `customSections.${(content.customSections || []).findIndex((c) => c.id === id)}.label`
              : `nav.${id}`;
            return (
              <li key={id}>
                {editing ? (
                  <div className={`nav-label-edit${activeSection === id ? " active" : ""}`}>
                    <Editable value={label} path={editPath} editing={editing} onCommit={commit} />
                  </div>
                ) : (
                  <a
                    href={`#${id}`}
                    className={activeSection === id ? "active" : ""}
                    onClick={() => setNavOpen(false)}
                  >
                    {label}
                  </a>
                )}
              </li>
            );
          })}
        </ul>

        <div className="side-foot">
          <ThemeToggle theme={theme} onChange={setTheme} />
          <div className="side-updated">Last updated {updatedLabel}</div>
          {isStaff && (
            <>
              {editing ? (
                <>
                  <BrandPalette
                    palette={palette}
                    accentColor={accentColor}
                    buttonColor={buttonColor}
                    onPaletteChange={(next, changedFrom, changedTo) => {
                      commit("meta.brandColors", next);
                      // Editing the color that's in use for the header or
                      // buttons updates that role too.
                      if (changedFrom && changedFrom.toLowerCase() === accentColor.toLowerCase()) setAccentColor(changedTo);
                      if (changedFrom && changedFrom.toLowerCase() === buttonColor.toLowerCase()) commit("meta.buttonColor", changedTo);
                    }}
                    onAccentChange={setAccentColor}
                    onButtonChange={(hex) => commit("meta.buttonColor", hex)}
                  />

                  <button type="button" className="side-btn primary" onClick={handleSave} disabled={saving}>
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                  <button type="button" className="side-btn ghost" onClick={() => setEditing(false)} disabled={saving}>
                    Done editing
                  </button>
                </>
              ) : canEdit ? (
                <button type="button" className="side-btn ghost" onClick={() => setEditing(true)}>
                  {mode === "draft" ? "Edit draft" : "Edit this page"}
                </button>
              ) : null}
              {/* Deliberately separate from editing and "Save changes":
                  the portal password only changes through its own
                  dialog, with the new password typed twice. */}
              <div className="portal-status">
                <span>
                  Client portal password: <b className={hasPassword ? "on" : "off"}>{hasPassword ? "On" : "Off"}</b>
                </span>
                <button type="button" className="mini-btn" onClick={() => setPasswordOpen(true)}>
                  {hasPassword ? "Manage" : "Set up"}
                </button>
              </div>
              <a href="/admin" className="side-link">
                &larr; All clients
              </a>
            </>
          )}
        </div>
      </aside>

      <div className="content">
        <header className="masthead">
          <div className="masthead-inner">
            {/* Client-first: their logo and name lead, biggest thing on
                the page -- this is their dashboard, not a Mojo report
                with their name pasted on it. */}
            <div className="masthead-client">
              <div className="client-logo-frame">
                <div
                  className="client-logo-swatch"
                  style={{ background: content.meta.clientLogoBg || "#fdfdf9" }}
                >
                  {content.meta.clientLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={content.meta.clientLogo} alt="" className="client-logo-lg" />
                  ) : (
                    <div className="client-logo-placeholder" aria-hidden="true">
                      {(content.meta.clientName || "?").trim().charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                {editing && (
                  <div className="client-logo-controls">
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={handleLogoUpload}
                    />
                    <button
                      type="button"
                      className="side-btn ghost edit-ctl client-logo-btn"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={logoBusy}
                    >
                      {logoBusy ? "Adding…" : content.meta.clientLogo ? "Change" : "+ Logo"}
                    </button>
                    <input
                      type="color"
                      className="logo-bg-input edit-ctl"
                      title="Background behind the logo"
                      value={/^#[0-9a-f]{6}$/i.test(content.meta.clientLogoBg) ? content.meta.clientLogoBg : "#fdfdf9"}
                      onChange={(e) => commit("meta.clientLogoBg", e.target.value)}
                    />
                  </div>
                )}
              </div>
              <div className="masthead-client-text">
                <RichEditable
                  as="div"
                  className="client-name-xl"
                  value={content.meta.clientName}
                  path="meta.clientName"
                  editing={editing}
                  onCommit={commit}
                />
                <div className="client-dashboard-label">Client Dashboard</div>
                <div className="client-studio-tagline">
                  {(content.meta.clientName || "Your").trim()}&rsquo;s Marketing Studio
                </div>
                <RichEditable
                  as="div"
                  className="client-context-line"
                  value={content.meta.tagline}
                  path="meta.tagline"
                  editing={editing}
                  onCommit={commit}
                />
              </div>
            </div>

            {/* Mojo's own branding moves to a small, secondary spot on
                the right, alongside the strategist the client actually
                works with day to day. */}
            <div className="masthead-mojo">
              <div className="mojo-mini-brand">
                <img src="/mojo-logo.png" alt="" width={18} height={18} />
                <span>Mountain Mojo Group</span>
              </div>
              <div className="strategist-card">
                <div className="strategist-photo-frame">
                  {content.meta.contactPhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={content.meta.contactPhoto} alt="" className="strategist-photo" />
                  ) : (
                    <div className="strategist-photo-placeholder" aria-hidden="true">
                      {(content.meta.contactName || "?").trim().charAt(0).toUpperCase()}
                    </div>
                  )}
                  {editing && (
                    <>
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={handlePhotoUpload}
                      />
                      <button
                        type="button"
                        className="strategist-photo-btn edit-ctl"
                        onClick={() => photoInputRef.current?.click()}
                        disabled={photoBusy}
                      >
                        {photoBusy ? "…" : "Photo"}
                      </button>
                    </>
                  )}
                </div>
                <div className="strategist-info">
                  <RichEditable
                    as="div"
                    className="strategist-name"
                    value={content.meta.contactName}
                    path="meta.contactName"
                    editing={editing}
                    onCommit={commit}
                  />
                  <RichEditable
                    as="div"
                    className="strategist-email"
                    value={content.meta.contactEmail}
                    path="meta.contactEmail"
                    editing={editing}
                    onCommit={commit}
                  />
                </div>
              </div>
            </div>
          </div>
        </header>

        {(hasMonthly || isStaff) && (
          <div className="view-tabs-bar">
            <div className="view-tabs" role="tablist">
              {[
                ["weekly", "Weekly Update"],
                ["monthly", "Monthly Meeting"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={view === id}
                  className={`view-tab${view === id ? " on" : ""}`}
                  onClick={() => view !== id && onSwitchView?.(id)}
                >
                  {label}
                  {isStaff && draftViews[id] && <span className="view-tab-draft">Draft</span>}
                </button>
              ))}
            </div>
            {view === "monthly" && mode !== "empty" && !editing && (
              <button type="button" className="present-btn" onClick={() => setPresenting(true)}>
                ▶ Present
              </button>
            )}
          </div>
        )}

        {isStaff && mode !== "empty" && (
          <div className={`mode-banner mode-${mode}`}>
            <div className="mode-banner-text">
              {mode === "live" && (
                <>
                  <b>Live</b> &middot; edits here save straight to what the client sees.
                </>
              )}
              {mode === "draft" && (
                <>
                  <b>Draft</b> &middot; the client still sees the published version until you publish.
                  {dirty && <span className="mode-unsaved"> Unsaved changes</span>}
                </>
              )}
              {mode === "preview" && (
                <>
                  <b>Previewing the published version</b> &middot; this is what the client sees right now.
                </>
              )}
            </div>
            <div className="mode-banner-actions">
              {mode === "live" && (
                <button type="button" className="mini-btn primary" onClick={() => onDraftAction?.("start")} disabled={dirty}>
                  Start a draft
                </button>
              )}
              {mode === "draft" && (
                <>
                  <button type="button" className="mini-btn" onClick={onTogglePreview}>
                    Preview client view
                  </button>
                  <button
                    type="button"
                    className="mini-btn primary"
                    onClick={() => (dirty ? showToast("Save your changes first, then publish") : onDraftAction?.("publish"))}
                  >
                    Publish draft
                  </button>
                  <button type="button" className="mini-btn danger" onClick={() => onDraftAction?.("discard")}>
                    Discard draft
                  </button>
                </>
              )}
              {mode === "preview" && (
                <button type="button" className="mini-btn primary" onClick={onTogglePreview}>
                  Back to the draft
                </button>
              )}
              {view === "weekly" && (
                <button type="button" className="mini-btn" onClick={() => setEmailOpen(true)}>
                  ✉ Weekly email
                </button>
              )}
              <button type="button" className="mini-btn" onClick={() => setHistoryOpen(true)}>
                History
              </button>
            </div>
          </div>
        )}

        <div className="wrap">
          {view === "monthly" && weeklyLive && <WeeklyOpenItems weekly={weeklyLive} onOpen={() => onSwitchView?.("weekly")} />}

          {mode === "empty" && (
            <div className="empty-tab-card">
              <h2>Set up the Monthly Meeting tab</h2>
              <p>
                Starts a draft with the monthly meeting layout: goal progress, goal scorecard, highlights, report
                review, what&apos;s upcoming, action items and the next meeting. The client won&apos;t see this tab until
                you publish it.
              </p>
              <button type="button" className="mini-btn primary" onClick={() => onDraftAction?.("start")}>
                Set up Monthly Meeting
              </button>
            </div>
          )}

          <SortableGroup
            idPrefix="section"
            items={sectionOrder}
            onReorder={reorderSections}
            disabled={!editing}
            rowClassName="section-drag-wrap"
          >
            {(sectionId) => (
              <>
                {sectionRenderers[sectionId] ? sectionRenderers[sectionId]() : null}
                {editing && (
                  <button
                    type="button"
                    className="section-remove-btn edit-ctl"
                    onClick={() => removeSection(sectionId)}
                    title="Remove this section from the page and the menu"
                  >
                    Remove section
                  </button>
                )}
              </>
            )}
          </SortableGroup>

          {editing && (
            <div className="add-section-row">
              <AddBtn label="New section" onClick={addCustomSection} />
              {hiddenBuiltins.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className="add-back-btn edit-ctl"
                  onClick={() => addBuiltinSection(s.id)}
                >
                  + Bring back &ldquo;{s.label}&rdquo;
                </button>
              ))}
            </div>
          )}

          <footer className="footer">
            <div className="footer-contact">
              <RichEditable as="span" className="footer-name" value={content.meta.contactName} path="meta.contactName" editing={editing} onCommit={commit} />
              <RichEditable as="span" className="footer-detail" value={content.meta.contactTitle} path="meta.contactTitle" editing={editing} onCommit={commit} />
              <RichEditable as="span" className="footer-detail" value={content.meta.contactEmail} path="meta.contactEmail" editing={editing} onCommit={commit} />
              <RichEditable as="span" className="footer-detail" value={content.meta.contactPhone} path="meta.contactPhone" editing={editing} onCommit={commit} />
            </div>
            <div className="footer-meta">
              <RichEditable as="span" className="footer-note" value={content.meta.footerNote} path="meta.footerNote" editing={editing} onCommit={commit} />
              {/* A real, computed timestamp -- not hand-typed, so it
                  can't say "Updated monthly" while actually changing
                  more often than that. See updatedLabel above. */}
              <span className="footer-updated">Last updated {updatedLabel}</span>
            </div>
          </footer>
        </div>
      </div>

      {passwordOpen && (
        <PasswordDialog
          hasPassword={hasPassword}
          saving={savingPassword}
          onSave={savePortalPassword}
          onClose={() => setPasswordOpen(false)}
        />
      )}
      {presenting && (
        <PresentMode
          content={content}
          sectionOrder={sectionOrder}
          renderers={sectionRenderers}
          navLabelFor={navLabelFor}
          onExit={() => setPresenting(false)}
        />
      )}
      {emailOpen && (
        <WeeklyEmailModal
          content={content}
          sectionOrder={sectionOrder}
          navLabelFor={navLabelFor}
          dashboardUrl={typeof window !== "undefined" ? `${window.location.origin}/c/${client.slug}` : ""}
          accent={accentColor}
          justPublished={openEmailOnMount}
          onClose={() => setEmailOpen(false)}
          onCopied={() => showToast("Email copied -- paste it into your email")}
        />
      )}
      {historyOpen && (
        <HistoryModal
          slug={client.slug}
          view={view}
          onClose={() => setHistoryOpen(false)}
          onRestore={(versionId) => {
            setHistoryOpen(false);
            onDraftAction?.("restore", { versionId });
          }}
        />
      )}

      <div className={`toast${toast ? " show" : ""}`}>{toast}</div>
    </div>
    </FieldSelectionContext.Provider>
    </FieldActionsContext.Provider>
  );
}
