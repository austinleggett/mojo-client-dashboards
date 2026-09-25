"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { NAV_SECTIONS, TAG_OPTIONS, ITEM_TEMPLATES } from "@/lib/contentTemplate";
import { getPath, setPath, pushAt, removeAt } from "@/lib/path";

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

export default function Dashboard({ client, isStaff }) {
  const [content, setContent] = useState(client.content);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const [activeSection, setActiveSection] = useState(NAV_SECTIONS[0].id);

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

  const setTag = useCallback((idx, opt) => {
    setContent((prev) => {
      let next = setPath(prev, `stores.items.${idx}.tag`, opt.label);
      next = setPath(next, `stores.items.${idx}.cls`, opt.cls);
      return next;
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${client.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { ...content, meta: { ...content.meta, updatedAt: new Date().toISOString() } },
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

  return (
    <div className="shell">
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
          <div className="mark">🏔️</div>
          <div className="side-title">
            Mountain Mojo
            <small>Client Dashboard</small>
          </div>
        </div>

        <ul className="side-nav">
          {NAV_SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className={activeSection === s.id ? "active" : ""}
                onClick={() => setNavOpen(false)}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="side-foot">
          <div className="side-updated">Last updated {updatedLabel}</div>
          {isStaff && (
            <>
              {editing ? (
                <>
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
              <div className="brand-mark">🏔️</div>
              <div>
                <div className="nav-brand">Mountain Mojo Group</div>
                <div className="nav-sub">Monthly Marketing Update</div>
              </div>
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
              <Editable
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
          {/* Performance recap */}
          <section id="recap" className="section">
            <div className="section-head">
              <div>
                <Editable className="eyebrow" value={content.recap.eyebrow} path="recap.eyebrow" editing={editing} onCommit={commit} />
                <Editable as="h2" value={content.recap.heading} path="recap.heading" editing={editing} onCommit={commit} />
              </div>
              <Editable as="p" className="section-note" value={content.recap.note} path="recap.note" editing={editing} onCommit={commit} />
            </div>

            <div className="glance-grid">
              {content.recap.stats.map((stat, i) => (
                <div className="stat-tile" key={i}>
                  {editing && <RemoveBtn onClick={() => removeItem("recap.stats", i)} />}
                  <Editable className="stat-label" value={stat.label} path={`recap.stats.${i}.label`} editing={editing} onCommit={commit} />
                  <Editable className="stat-value" value={stat.value} path={`recap.stats.${i}.value`} editing={editing} onCommit={commit} />
                  <Editable
                    className={`stat-sub${stat.good ? " good" : ""}`}
                    value={stat.sub}
                    path={`recap.stats.${i}.sub`}
                    editing={editing}
                    onCommit={commit}
                  />
                </div>
              ))}
            </div>
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

          {/* Momentum */}
          <section id="momentum" className="section">
            <div className="section-head">
              <div>
                <span className="eyebrow">Momentum</span>
                <h2>What&apos;s been moving</h2>
              </div>
            </div>
            <div className="momentum-grid">
              {content.momentum.items.map((m, i) => (
                <div className="momentum-card" key={i}>
                  <div className="card-top-row">
                    <Editable className="momentum-month" value={m.month} path={`momentum.items.${i}.month`} editing={editing} onCommit={commit} />
                    {editing && <RemoveBtn onClick={() => removeItem("momentum.items", i)} />}
                  </div>
                  <Editable as="p" value={m.text} path={`momentum.items.${i}.text`} editing={editing} onCommit={commit} />
                </div>
              ))}
            </div>
            {editing && <div style={{ marginTop: 10 }}><AddBtn label="Add highlight" onClick={() => addItem("momentum.items", ITEM_TEMPLATES.momentumItem)} /></div>}
          </section>

          {/* Store spotlights */}
          <section id="stores" className="section">
            <div className="section-head">
              <div>
                <span className="eyebrow">Store Spotlights</span>
                <h2>Location-by-location notes</h2>
              </div>
            </div>
            <div className="store-grid">
              {content.stores.items.map((store, i) => (
                <div className="store-card" key={i}>
                  <div className="store-card-top">
                    <Editable className="store-name" value={store.name} path={`stores.items.${i}.name`} editing={editing} onCommit={commit} />
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span className={`store-tag ${store.cls}`}>{store.tag}</span>
                      {editing && <RemoveBtn onClick={() => removeItem("stores.items", i)} />}
                    </div>
                  </div>
                  <Editable as="p" value={store.text} path={`stores.items.${i}.text`} editing={editing} onCommit={commit} />
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
                </div>
              ))}
            </div>
            {editing && <div style={{ marginTop: 10 }}><AddBtn label="Add store" onClick={() => addItem("stores.items", ITEM_TEMPLATES.storeItem)} /></div>}
          </section>

          {/* Ready for review + Questions */}
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
                    {group.items.map((item, ii) => (
                      <div className="review-item" key={ii}>
                        <div className="review-item-top">
                          <div>
                            <Editable className="review-item-title" value={item.title} path={`review.groups.${gi}.items.${ii}.title`} editing={editing} onCommit={commit} />
                            <Editable as="div" className="review-item-store" value={item.store} path={`review.groups.${gi}.items.${ii}.store`} editing={editing} onCommit={commit} />
                          </div>
                          {editing && <RemoveBtn onClick={() => removeItem(`review.groups.${gi}.items`, ii)} />}
                        </div>
                        <Editable as="div" className="review-item-desc" value={item.desc} path={`review.groups.${gi}.items.${ii}.desc`} editing={editing} onCommit={commit} />
                      </div>
                    ))}
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
                {content.questions.items.map((q, i) => (
                  <div className="question-item" key={i}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <Editable className="question-store" value={q.store} path={`questions.items.${i}.store`} editing={editing} onCommit={commit} />
                      {editing && <RemoveBtn onClick={() => removeItem("questions.items", i)} />}
                    </div>
                    <Editable as="div" className="question-title" value={q.title} path={`questions.items.${i}.title`} editing={editing} onCommit={commit} />
                    {(q.excerpt || editing) && (
                      <Editable as="div" className="question-excerpt" value={q.excerpt} path={`questions.items.${i}.excerpt`} editing={editing} onCommit={commit} />
                    )}
                    {(q.response || editing) && (
                      <Editable as="div" className="question-response" value={q.response} path={`questions.items.${i}.response`} editing={editing} onCommit={commit} />
                    )}
                  </div>
                ))}
                {editing && (
                  <div className="add-item-row">
                    <AddBtn label="Add question" onClick={() => addItem("questions.items", ITEM_TEMPLATES.questionItem)} />
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Working on */}
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
                  <ul className="work-list">
                    {col.items.map((item, ii) => (
                      <li key={ii}>
                        <span className="work-check">
                          <CheckIcon />
                        </span>
                        <Editable as="span" className="work-item-text" value={item} path={`working.columns.${ci}.items.${ii}`} editing={editing} onCommit={commit} />
                        {editing && <RemoveBtn onClick={() => removeItem(`working.columns.${ci}.items`, ii)} />}
                      </li>
                    ))}
                  </ul>
                  {editing && <AddBtn label="Add task" onClick={() => addItem(`working.columns.${ci}.items`, ITEM_TEMPLATES.workingItem)} />}
                </div>
              ))}
            </div>
          </section>

          {/* Approved & live */}
          <section id="approved" className="section">
            <div className="section-head">
              <div>
                <span className="eyebrow">Approved &amp; Live</span>
                <h2>Recently shipped</h2>
              </div>
            </div>
            <div className="approved-strip">
              {content.approved.items.map((item, i) => (
                <span className="approved-chip" key={i}>
                  <span className="dot">
                    <CheckIcon />
                  </span>
                  <Editable value={item} path={`approved.items.${i}`} editing={editing} onCommit={commit} />
                  {editing && <RemoveBtn onClick={() => removeItem("approved.items", i)} />}
                </span>
              ))}
              {editing && <AddBtn label="Add" onClick={() => addItem("approved.items", ITEM_TEMPLATES.approvedItem)} />}
            </div>
          </section>

          {/* Events & meetings */}
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
                {content.events.items.map((ev, i) => (
                  <div className="event-row" key={i}>
                    <div className="event-date">
                      <Editable as="div" className="num" value={ev.day} path={`events.items.${i}.day`} editing={editing} onCommit={commit} />
                      <Editable as="div" className="mon" value={ev.mon} path={`events.items.${i}.mon`} editing={editing} onCommit={commit} />
                    </div>
                    <div className="event-main">
                      <Editable className="event-title" value={ev.title} path={`events.items.${i}.title`} editing={editing} onCommit={commit} />
                      <Editable as="div" className="event-loc" value={ev.loc} path={`events.items.${i}.loc`} editing={editing} onCommit={commit} />
                    </div>
                    {editing && <RemoveBtn onClick={() => removeItem("events.items", i)} />}
                  </div>
                ))}
                {editing && <div style={{ marginTop: 8 }}><AddBtn label="Add event" onClick={() => addItem("events.items", ITEM_TEMPLATES.eventItem)} /></div>}
              </div>
              <div className="panel panel-pad">
                <h4>Meeting cadence</h4>
                {content.meetings.items.map((m, i) => (
                  <div className="cadence-row" key={i}>
                    <div>
                      <Editable className="cadence-name" value={m.name} path={`meetings.items.${i}.name`} editing={editing} onCommit={commit} />
                      <Editable as="div" className="cadence-freq" value={m.freq} path={`meetings.items.${i}.freq`} editing={editing} onCommit={commit} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Editable className="cadence-next" value={m.next} path={`meetings.items.${i}.next`} editing={editing} onCommit={commit} />
                      {editing && <RemoveBtn onClick={() => removeItem("meetings.items", i)} />}
                    </div>
                  </div>
                ))}
                {editing && <div style={{ marginTop: 8 }}><AddBtn label="Add meeting" onClick={() => addItem("meetings.items", ITEM_TEMPLATES.meetingItem)} /></div>}
              </div>
            </div>
          </section>

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
            <Editable value={content.meta.footerNote} path="meta.footerNote" editing={editing} onCommit={commit} />
          </footer>
        </div>
      </div>

      <div className={`toast${toast ? " show" : ""}`}>{toast}</div>
    </div>
  );
}
