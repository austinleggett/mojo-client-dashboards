// Sends the "a client responded" notification email -- one place, so
// the /respond API route doesn't need to know anything about how mail
// actually gets sent. Uses Resend (https://resend.com); add RESEND_API_KEY
// in your environment to turn this on.
//
// Setup, once, in Vercel's Project Settings -> Environment Variables:
//   RESEND_API_KEY   -- from your Resend account's API Keys page.
//   EMAIL_FROM       -- optional. Defaults to Resend's shared sandbox
//                       address, which can only deliver to the email
//                       you signed up to Resend with -- fine for a
//                       first test, not for real client traffic. For
//                       real delivery to Kayla (or whoever else), add
//                       your domain in Resend's Domains page (a couple
//                       of DNS records), then set this to something
//                       like "Timberline Dashboard <notifications@mountainmojogroup.com>".
//
// Deliberately fails soft: if the key isn't set, or the send errors out
// for any reason, this logs it and returns -- it never throws, so a
// client's approval/edit-request always still saves even if the email
// doesn't go out.
export async function sendApprovalNotice({ to, clientName, itemLabel, status, comment, dashboardUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set -- skipping approval notification email.");
    return;
  }
  if (!to) {
    console.warn(`[email] ${clientName} has no Marketing Strategist email set -- skipping notification.`);
    return;
  }

  const from = process.env.EMAIL_FROM || "Mountain Mojo Dashboard <onboarding@resend.dev>";
  const approved = status === "approved";
  // Covers both flavors of this widget: approve/needs-edits on a
  // review or question item, and approve/reschedule/cancel on an
  // event or meeting -- same email, just different verbs.
  const VERB = {
    approved: "approved",
    needs_edits: "requested edits on",
    reschedule: "asked to reschedule",
    cancel: "asked to cancel",
  };
  const verb = VERB[status] || "responded to";
  const subject = `${clientName} ${approved ? "approved" : verb}: ${itemLabel}`;
  const bodyLines = [
    `<p><strong>${escapeHtml(clientName)}</strong> ${verb} an item on their dashboard:</p>`,
    `<p style="font-size:16px;font-weight:700;margin:4px 0 12px;">${escapeHtml(itemLabel)}</p>`,
  ];
  if (!approved && comment) {
    bodyLines.push(
      `<p style="background:#f6f4ee;border-radius:8px;padding:10px 14px;margin:0 0 14px;"><strong>Their note:</strong> ${escapeHtml(
        comment
      )}</p>`
    );
  }
  if (dashboardUrl) {
    bodyLines.push(`<p><a href="${dashboardUrl}">View it on the dashboard &rarr;</a></p>`);
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        html: bodyLines.join("\n"),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[email] Resend responded ${res.status}: ${body}`);
    }
  } catch (err) {
    console.error("[email] Failed to send approval notification:", err);
  }
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
