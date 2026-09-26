"use client";

import { useState } from "react";

// Click-to-edit "/c/<slug>" control for a row on the admin client
// list. Renaming a client's slug immediately changes its dashboard's
// URL -- any link already sent out (to the client, in an email, saved
// as a bookmark) using the old one stops working the moment this
// saves, so this is a deliberate rename, not a redirect-and-keep-both
// situation. Saving reloads the page so the "Open" link and the URL
// shown here both reflect the new slug right away.
export default function SlugEditor({ slug: initialSlug }) {
  const [slug, setSlug] = useState(initialSlug);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialSlug);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function startEditing() {
    setDraft(slug);
    setError("");
    setEditing(true);
  }

  async function save() {
    const next = draft.trim().toLowerCase();
    if (!next) {
      setError("This can't be blank.");
      return;
    }
    if (next === slug) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/clients/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't save that.");
      // The row's own fetch calls (and every other link on this page)
      // are keyed off the old slug -- simplest to just reload rather
      // than juggle renamed state through the rest of the admin list.
      window.location.reload();
    } catch (err) {
      setError(err.message || "Couldn't save that.");
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <span className="slug-editor">
        /c/{slug}
        <button type="button" className="slug-edit-btn" onClick={startEditing}>
          Edit URL
        </button>
      </span>
    );
  }

  return (
    <span className="slug-editor editing">
      /c/
      <input
        className="slug-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        disabled={saving}
        autoFocus
      />
      <button type="button" className="slug-save-btn" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
      <button type="button" className="slug-cancel-btn" onClick={() => setEditing(false)} disabled={saving}>
        Cancel
      </button>
      {error && <span className="slug-error">{error}</span>}
    </span>
  );
}
