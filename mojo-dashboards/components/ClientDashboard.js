"use client";

import { useCallback, useRef, useState } from "react";
import Dashboard from "@/components/Dashboard";
import { blankMonthlyContent } from "@/lib/contentTemplate";

// Owns which tab (Weekly Update / Monthly Meeting) is showing and, for
// staff, whether that tab's draft or its published version is on
// screen. The actual page is <Dashboard>, remounted fresh (via `key`)
// whenever the tab or mode changes, so its edit state and undo history
// always belong to exactly one tab and one copy.
//
//   live     no draft open -- staff edits save straight to the client's page
//   draft    a draft is open -- staff edit it; the client sees the published version
//   preview  staff, with a draft open, looking at the published version read-only
//   empty    staff on a Monthly tab that hasn't been set up yet
const FIELDS = {
  weekly: { live: "content", draft: "draftContent" },
  monthly: { live: "monthlyContent", draft: "draftMonthlyContent" },
};

export default function ClientDashboard({ client: initialClient, isStaff, canRespond, initialView = "weekly" }) {
  const [client, setClient] = useState(initialClient);
  const hasMonthly = !!client.monthlyContent;
  const [view, setView] = useState(initialView === "monthly" && (hasMonthly || isStaff) ? "monthly" : "weekly");
  const [preview, setPreview] = useState(false);
  const [remount, setRemount] = useState(0);
  const [openEmail, setOpenEmail] = useState(false);
  const [confirm, setConfirm] = useState(null); // { title, body, action, extra, danger }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirtyRef = useRef(false);
  const onDirtyChange = useCallback((d) => {
    dirtyRef.current = d;
  }, []);

  const f = FIELDS[view];
  const meta = client.content?.meta || {};
  const liveDoc = client[f.live];
  const draftDoc = isStaff ? client[f.draft] : null;
  const mode = draftDoc ? (preview ? "preview" : "draft") : liveDoc ? "live" : "empty";
  const doc = mode === "draft" ? draftDoc : liveDoc || { ...blankMonthlyContent(), sectionOrder: [] };

  function setUrlView(v) {
    try {
      const url = new URL(window.location.href);
      if (v === "monthly") url.searchParams.set("view", "monthly");
      else url.searchParams.delete("view");
      window.history.replaceState(null, "", url.toString());
    } catch {}
  }

  function switchView(v) {
    if (dirtyRef.current) {
      setConfirm({
        title: "Leave without saving?",
        body: "You have unsaved changes on this tab. Switching tabs will lose them.",
        run: () => doSwitch(v),
        cta: "Switch anyway",
        danger: true,
      });
      return;
    }
    doSwitch(v);
  }
  function doSwitch(v) {
    dirtyRef.current = false;
    setView(v);
    setPreview(false);
    setOpenEmail(false);
    setUrlView(v);
    window.scrollTo({ top: 0 });
  }

  async function runDraftAction(action, extra = {}) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/clients/${client.slug}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ view, action, ...extra }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "That didn't work.");
      dirtyRef.current = false;
      setClient(body.client);
      setPreview(false);
      setOpenEmail(action === "publish" && view === "weekly");
      setRemount((k) => k + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Publishing, discarding and restoring change what the client sees
  // (or throw work away), so they ask first.
  function onDraftAction(action, extra) {
    const tab = view === "weekly" ? "Weekly Update" : "Monthly Meeting";
    if (action === "publish") {
      setConfirm({
        title: `Publish the ${tab} draft?`,
        body: "The client will see this version right away. The current published version is saved to History first, so you can restore it.",
        run: () => runDraftAction("publish"),
        cta: "Publish",
      });
    } else if (action === "discard") {
      setConfirm({
        title: "Discard this draft?",
        body: "Your draft changes will be deleted. The published version the client sees stays exactly as it is.",
        run: () => runDraftAction("discard"),
        cta: "Discard draft",
        danger: true,
      });
    } else if (action === "restore") {
      runDraftAction("restore", extra);
    } else {
      runDraftAction(action, extra);
    }
  }

  return (
    <>
      <Dashboard
        key={`${view}:${mode}:${remount}`}
        client={{ ...client, content: { ...doc, meta } }}
        isStaff={isStaff}
        canRespond={mode === "live" ? canRespond : mode === "draft" ? isStaff : false}
        view={view}
        mode={mode}
        hasMonthly={hasMonthly}
        draftViews={{ weekly: !!client.draftContent, monthly: !!client.draftMonthlyContent }}
        weeklyLive={view === "monthly" ? client.content : null}
        onSwitchView={switchView}
        onDraftAction={onDraftAction}
        onTogglePreview={() => {
          if (!preview && dirtyRef.current) {
            setConfirm({
              title: "Leave without saving?",
              body: "You have unsaved changes in the draft. Save first, or they'll be lost.",
              run: () => {
                dirtyRef.current = false;
                setPreview(true);
              },
              cta: "Preview anyway",
              danger: true,
            });
            return;
          }
          setPreview((p) => !p);
        }}
        onSaved={(c) => c && setClient(c)}
        onDirtyChange={onDirtyChange}
        openEmailOnMount={openEmail}
      />
      {confirm && (
        <div className="link-dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setConfirm(null)}>
          <div className="link-dialog" role="alertdialog">
            <h4>{confirm.title}</h4>
            <p className="email-hint">{confirm.body}</p>
            <div className="link-dialog-actions">
              <span style={{ flex: 1 }} />
              <button type="button" className="mini-btn" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={`mini-btn ${confirm.danger ? "danger-solid" : "primary"}`}
                onClick={() => {
                  const run = confirm.run;
                  setConfirm(null);
                  run();
                }}
              >
                {confirm.cta}
              </button>
            </div>
          </div>
        </div>
      )}
      {(busy || error) && (
        <div className={`toast show${error ? " toast-error" : ""}`} onClick={() => setError("")}>
          {busy ? "Working…" : error}
        </div>
      )}
    </>
  );
}
