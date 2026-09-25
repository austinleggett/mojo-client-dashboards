"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { NAV_SECTIONS, TAG_OPTIONS, ITEM_TEMPLATES, DEFAULT_SECTION_ORDER } from "@/lib/contentTemplate";
import { getPath, setPath, pushAt, removeAt } from "@/lib/path";
import { SortableGroup, arrayMove } from "@/components/Sortable";
import FormatToolbar from "@/components/FormatToolbar";

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
// "standard word editing features" for the longer prose fields
// (recap note, momentum highlights, store notes, etc). Only used where
// that actually makes sense; short fields (names, labels, dates, stat
// values) stay plain Editable. See lib/sanitize.js for the matching
// server-side allowlist -- these are the only fields sanitized there.
function RichEditable({ as: Tag = "div", value, path, editing, onCommit, className }) {
  const ref = useRef(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (value ?? "")) {
      ref.current.innerHTML = value ?? "";
    }
  }, [value]);

  return (
    <div className={`rich-field${editing ? (focused ? " rich-field-active" : " rich-field-hint") : ""}`}>
      {editing && focused && <FormatToolbar getTarget={() => ref.current} />}
      <Tag
        ref={ref}
        className={className}
        contentEditable={editing}
        suppressContentEditableWarning
        onFocus={editing ? () => setFocused(true) : undefined}
        onBlur={
          editing
            ? (e) => {
                setFocused(false);
                const html = e.currentTarget.innerHTML;
                if (html !== (value ?? "")) onCommit(path, html);
              }
            : undefined
        }
      />
    </div>
  );
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
function brandVars(accentColor) {
  const rgb = hexToRgb(accentColor);
  if (!rgb) return {};
  return {
    "--brand": accentColor,
    "--brand-strong": mix(accentColor, [0, 0, 0], 0.28),
    "--brand-tint": mix(accentColor, [255, 255, 255], 0.88),
  };
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

export default function Dashboard({ client, isStaff }) {
  const [content, setContent] = useState(client.content);
  const [accentColor, setAccentColor] = useState(client.accentColor || "#1f4d3a");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const [activeSection, setActiveSection] = useState(NAV_SECTIONS[0].id);
  const [logoBusy, setLogoBusy] = useState(false);
  const logoInputRef = useRef(null);

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
    const sections = NAV_SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean);
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
  }, []);

  const commit = useCallback((path, value) => {
    setContent((prev) => setPath(prev, path, value));
  }, []);

  const addItem = useCallback((path, template) => {
    setContent((prev) => pushAt(prev, path, template()));
  }, []);

  const removeItem = useCallback((path, idx) => {
    setContent((prev) => removeAt(prev, path, idx));
  }, []);

  const reorder = useCallback((path, from, to) => {
    setContent((prev) => setPath(prev, path, arrayMove(getPath(prev, path) || [], from, to)));
  }, []);

  const setTag = useCallback((idx, opt) => {
    setContent((prev) => {
      let next = setPath(prev, `stores.items.${idx}.tag`, opt.label);
      next = setPath(next, `stores.items.${idx}.cls`, opt.cls);
      return next;
    });
  }, []);

  const sectionOrder = content.sectionOrder && content.sectionOrder.length ? content.sectionOrder : DEFAULT_SECTION_ORDER;
  function reorderSections(from, to) {
    setContent((prev) => {
      const cur = prev.sectionOrder && prev.sectionOrder.length ? prev.sectionOrder : DEFAULT_SECTION_ORDER;
      return { ...prev, sectionOrder: arrayMove(cur, from, to) };
    });
  }

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Please choose an image file");
      return;
    }
    setLogoBusy(true);
    try {
      const dataUrl = await fileToLogoDataUrl(file);
      commit("meta.clientLogo", dataUrl);
      showToast("Logo added -- remember to save");
    } catch (err) {
      showToast(err.message || "Couldn't add that logo");
    } finally {
      setLogoBusy(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${client.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { ...content, meta: { ...content.meta, updatedAt: new Date().toISOString() } },
          accentColor,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed (${res.status})`);
      }
      const { content: saved } = await res.json();
      setContent(saved);
      showToast("Saved");
    } catch (err) {
      showToast(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const updatedLabel = useMemo(() => {
    try {
      return new Date(content.meta.updatedAt).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
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
            <Editable className="eyebrow" value={content.recap.eyebrow} path="recap.eyebrow" editing={editing} onCommit={commit} />
            <Editable as="h2" value={content.recap.heading} path="recap.heading" editing={editing} onCommit={commit} />
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
              <Editable as="div" className="stat-label" value={stat.label} path={`recap.stats.${i}.label`} editing={editing} onCommit={commit} />
              <Editable as="div" className="stat-value" value={stat.value} path={`recap.stats.${i}.value`} editing={editing} onCommit={commit} />
              <Editable
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
                <Editable value={note} path={`recap.footnote.${i}`} editing={editing} onCommit={commit} />
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
            <span className="eyebrow">Momentum</span>
            <h2>What&apos;s been moving</h2>
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
                <Editable className="momentum-month" value={m.month} path={`momentum.items.${i}.month`} editing={editing} onCommit={commit} />
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
            <span className="eyebrow">Store Spotlights</span>
            <h2>Location-by-location notes</h2>
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
                <Editable className="store-name" value={store.name} path={`stores.items.${i}.name`} editing={editing} onCommit={commit} />
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className={`store-tag ${store.cls}`}>{store.tag}</span>
                  {editing && <RemoveBtn onClick={() => removeItem("stores.items", i)} />}
                </div>
              </div>
              <RichEditable as="p" value={store.text} path={`stores.items.${i}.text`} editing={editing} onCommit={commit} />
              {editing && (
                <div className="tag-picker">
                  {TAG_OPTIONS.map((opt) => (
                    <button
                      type="button"
                      key={opt.cls}
                      className={`tag-opt${store.cls === opt.cls ? " on" : ""}`}
                      onClick={() => setTag(i, opt)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
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
              <h3>Ready for Your Review</h3>
              <span className="count-badge">
                {content.review.groups.reduce((n, g) => n + g.items.length, 0)}
              </span>
            </div>
            {content.review.groups.map((group, gi) => (
              <div key={gi}>
                <div className="review-group-label">
                  <Editable value={group.label} path={`review.groups.${gi}.label`} editing={editing} onCommit={commit} />
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
                          <Editable className="review-item-title" value={item.title} path={`review.groups.${gi}.items.${ii}.title`} editing={editing} onCommit={commit} />
                          <Editable as="div" className="review-item-store" value={item.store} path={`review.groups.${gi}.items.${ii}.store`} editing={editing} onCommit={commit} />
                        </div>
                        {editing && <RemoveBtn onClick={() => removeItem(`review.groups.${gi}.items`, ii)} />}
                      </div>
                      <RichEditable as="div" className="review-item-desc" value={item.desc} path={`review.groups.${gi}.items.${ii}.desc`} editing={editing} onCommit={commit} />
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
              <h3>Questions &amp; Requests</h3>
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
                    <Editable className="question-store" value={q.store} path={`questions.items.${i}.store`} editing={editing} onCommit={commit} />
                    {editing && <RemoveBtn onClick={() => removeItem("questions.items", i)} />}
                  </div>
                  <Editable as="div" className="question-title" value={q.title} path={`questions.items.${i}.title`} editing={editing} onCommit={commit} />
                  {(q.excerpt || editing) && (
                    <RichEditable as="div" className="question-excerpt" value={q.excerpt} path={`questions.items.${i}.excerpt`} editing={editing} onCommit={commit} />
                  )}
                  {(q.response || editing) && (
                    <RichEditable as="div" className="question-response" value={q.response} path={`questions.items.${i}.response`} editing={editing} onCommit={commit} />
                  )}
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
            <span className="eyebrow">In Progress</span>
            <h2>What we&apos;re working on</h2>
          </div>
        </div>
        <div className="work-grid">
          {content.working.columns.map((col, ci) => (
            <div className="work-col" key={ci}>
              <Editable as="h4" value={col.label} path={`working.columns.${ci}.label`} editing={editing} onCommit={commit} />
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
                    <Editable as="span" className="work-item-text" value={item} path={`working.columns.${ci}.items.${ii}`} editing={editing} onCommit={commit} />
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
            <span className="eyebrow">Approved &amp; Live</span>
            <h2>Recently shipped</h2>
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
              <Editable value={item} path={`approved.items.${i}`} editing={editing} onCommit={commit} />
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
            <span className="eyebrow">What&apos;s Ahead</span>
            <h2>Events &amp; meeting cadence</h2>
          </div>
        </div>
        <div className="upcoming-grid">
          <div className="panel panel-pad">
            <h4>Upcoming events</h4>
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
                    <Editable as="div" className="num" value={ev.day} path={`events.items.${i}.day`} editing={editing} onCommit={commit} />
                    <Editable as="div" className="mon" value={ev.mon} path={`events.items.${i}.mon`} editing={editing} onCommit={commit} />
                  </div>
                  <div className="event-main">
                    <Editable className="event-title" value={ev.title} path={`events.items.${i}.title`} editing={editing} onCommit={commit} />
                    <Editable as="div" className="event-loc" value={ev.loc} path={`events.items.${i}.loc`} editing={editing} onCommit={commit} />
                  </div>
                  {editing && <RemoveBtn onClick={() => removeItem("events.items", i)} />}
                </>
              )}
            </SortableGroup>
            {editing && <div style={{ marginTop: 8 }}><AddBtn label="Add event" onClick={() => addItem("events.items", ITEM_TEMPLATES.eventItem)} /></div>}
          </div>
          <div className="panel panel-pad">
            <h4>Meeting cadence</h4>
            <SortableGroup
              idPrefix="meetings.items"
              items={content.meetings.items}
              onReorder={(from, to) => reorder("meetings.items", from, to)}
              disabled={!editing}
              rowClassName="cadence-row"
            >
              {(m, i) => (
                <>
                  <div>
                    <Editable className="cadence-name" value={m.name} path={`meetings.items.${i}.name`} editing={editing} onCommit={commit} />
                    <Editable as="div" className="cadence-freq" value={m.freq} path={`meetings.items.${i}.freq`} editing={editing} onCommit={commit} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Editable className="cadence-next" value={m.next} path={`meetings.items.${i}.next`} editing={editing} onCommit={commit} />
                    {editing && <RemoveBtn onClick={() => removeItem("meetings.items", i)} />}
                  </div>
                </>
              )}
            </SortableGroup>
            {editing && <div style={{ marginTop: 8 }}><AddBtn label="Add meeting" onClick={() => addItem("meetings.items", ITEM_TEMPLATES.meetingItem)} /></div>}
          </div>
        </div>
      </section>
    );
  }

  const sectionRenderers = {
    recap: renderRecap,
    momentum: renderMomentum,
    stores: renderStores,
    reviewQuestions: renderReviewQuestions,
    working: renderWorking,
    approved: renderApproved,
    upcoming: renderUpcoming,
  };

  return (
    <div className="shell" style={brandVars(accentColor)}>
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
          {NAV_SECTIONS.map((s) => {
            const label = getPath(content, `nav.${s.id}`) ?? s.label;
            return (
              <li key={s.id}>
                {editing ? (
                  <div className={`nav-label-edit${activeSection === s.id ? " active" : ""}`}>
                    <Editable
                      value={label}
                      path={`nav.${s.id}`}
                      editing={editing}
                      onCommit={commit}
                    />
                  </div>
                ) : (
                  <a
                    href={`#${s.id}`}
                    className={activeSection === s.id ? "active" : ""}
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
          <div className="side-updated">Last updated {updatedLabel}</div>
          {isStaff && (
            <>
              {editing ? (
                <>
                  <div className="brand-color-row">
                    <label htmlFor="accentColor">Brand color</label>
                    <input
                      id="accentColor"
                      type="color"
                      value={/^#[0-9a-f]{6}$/i.test(accentColor) ? accentColor : "#1f4d3a"}
                      onChange={(e) => setAccentColor(e.target.value)}
                    />
                  </div>
                  <button type="button" className="side-btn primary" onClick={handleSave} disabled={saving}>
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                  <button type="button" className="side-btn ghost" onClick={() => setEditing(false)} disabled={saving}>
                    Done editing
                  </button>
                </>
              ) : (
                <button type="button" className="side-btn ghost" onClick={() => setEditing(true)}>
                  Edit this page
                </button>
              )}
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
            <div className="brand-row">
              <div className="brand-mark">
                <img src="/mojo-logo.png" alt="Mountain Mojo Group" width={22} height={22} />
              </div>
              <div>
                <div className="nav-brand">Mountain Mojo Group</div>
                <div className="nav-sub">Monthly Marketing Update</div>
              </div>

              {(content.meta.clientLogo || editing) && (
                <div className="client-logo-wrap">
                  {content.meta.clientLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={content.meta.clientLogo} alt="" className="client-logo" />
                  ) : null}
                  {editing && (
                    <>
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
                        {logoBusy ? "Adding…" : content.meta.clientLogo ? "Change logo" : "+ Client logo"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="masthead-meta">
              <Editable
                as="div"
                className="client-name"
                value={content.meta.clientName}
                path="meta.clientName"
                editing={editing}
                onCommit={commit}
              />
              <RichEditable
                as="div"
                value={content.meta.tagline}
                path="meta.tagline"
                editing={editing}
                onCommit={commit}
              />
            </div>
          </div>
        </header>

        <div className="wrap">
          <SortableGroup
            idPrefix="section"
            items={sectionOrder}
            onReorder={reorderSections}
            disabled={!editing}
            rowClassName="section-drag-wrap"
          >
            {(sectionId) => (sectionRenderers[sectionId] ? sectionRenderers[sectionId]() : null)}
          </SortableGroup>

          <footer className="footer">
            <div>
              <Editable as="strong" value={content.meta.contactName} path="meta.contactName" editing={editing} onCommit={commit} />
              {" · "}
              <Editable value={content.meta.contactTitle} path="meta.contactTitle" editing={editing} onCommit={commit} />
              {" · "}
              <Editable value={content.meta.contactEmail} path="meta.contactEmail" editing={editing} onCommit={commit} />
              {" · "}
              <Editable value={content.meta.contactPhone} path="meta.contactPhone" editing={editing} onCommit={commit} />
            </div>
            <RichEditable value={content.meta.footerNote} path="meta.footerNote" editing={editing} onCommit={commit} />
          </footer>
        </div>
      </div>

      <div className={`toast${toast ? " show" : ""}`}>{toast}</div>
    </div>
  );
}
