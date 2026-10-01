"use client";

import { useState } from "react";

// The Live / Draft switch for each of a client's two tabs, on the
// /admin client list. Switching a tab to Draft opens a draft copy for
// the team to work on while the client keeps seeing the published
// version. Switching back asks whether to publish the draft or
// discard it.
export default function DraftToggles({ slug, initial }) {
  const [state, setState] = useState(initial);
  const [ask, setAsk] = useState(null); // view awaiting publish/discard choice
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function act(view, action) {
    setBusy(view);
    setError("");
    try {
      const res = await fetch(`/api/clients/${slug}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ view, action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "That didn't work.");
      const c = body.client;
      setState({ weekly: !!c.draftContent, monthly: !!c.draftMonthlyContent, hasMonthly: !!c.monthlyContent });
      setAsk(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  const row = (view, label) => {
    const isDraft = state[view];
    const notSetUp = view === "monthly" && !state.hasMonthly && !isDraft;
    return (
      <div className="draft-toggle-row" key={view}>
        <span className="draft-toggle-label">{label}</span>
        {notSetUp ? (
          <button type="button" className="draft-setup-btn" disabled={!!busy} onClick={() => act(view, "start")}>
            {busy === view ? "…" : "+ Set up"}
          </button>
        ) : (
          <div className="draft-switch" role="group" aria-label={`${label}: live or draft`}>
            <button
              type="button"
              className={!isDraft ? "on" : ""}
              disabled={!!busy}
              onClick={() => isDraft && setAsk(view)}
              title={isDraft ? "Publish or discard the draft" : "The client sees this tab as it is now"}
            >
              Live
            </button>
            <button
              type="button"
              className={isDraft ? "on draft" : ""}
              disabled={!!busy}
              onClick={() => !isDraft && act(view, "start")}
              title={isDraft ? "A draft is open" : "Start a draft. The client keeps seeing the live version"}
            >
              {busy === view ? "…" : "Draft"}
            </button>
          </div>
        )}
        {isDraft && (
          <a className="draft-edit-link" href={`/c/${slug}${view === "monthly" ? "?view=monthly" : ""}`}>
            Edit draft
          </a>
        )}
        {ask === view && (
          <div className="draft-ask">
            <span>Publish this draft so the client sees it, or discard it?</span>
            <button type="button" className="mini-btn primary" disabled={!!busy} onClick={() => act(view, "publish")}>
              Publish
            </button>
            <button type="button" className="mini-btn danger" disabled={!!busy} onClick={() => act(view, "discard")}>
              Discard
            </button>
            <button type="button" className="mini-btn" onClick={() => setAsk(null)}>
              Keep editing
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="draft-toggles">
      {row("weekly", "Weekly")}
      {row("monthly", "Monthly")}
      {error && <div className="draft-error">{error}</div>}
    </div>
  );
}
