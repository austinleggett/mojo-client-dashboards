// The shape every client's `content` JSON follows, and the blank
// starting point for a brand-new client. Keep this in sync with the
// sections the Dashboard component knows how to render.

// The order the dashboard's top-level sections render in. Draggable in
// edit mode (see Dashboard.js) -- a client's saved order lives at
// content.sectionOrder; this is only the default for new clients and
// the fallback for older clients saved before section reordering
// existed.
export const DEFAULT_SECTION_ORDER = [
  "recap",
  "momentum",
  "stores",
  "reviewQuestions",
  "working",
  "approved",
  "upcoming",
];

export function blankContent(clientName) {
  return {
    meta: {
      clientName: clientName || "New Client",
      tagline: "Add a location count and region here",
      contactName: "Your Name",
      contactTitle: "Marketing Strategist, Mountain Mojo Group",
      contactEmail: "you@mountainmojogroup.com",
      contactPhone: "480-292-0273",
      footerNote: `Prepared for ${clientName || "your client"} · Updated monthly`,
      updatedAt: new Date().toISOString(),
      clientLogo: "",
      // The Marketing Strategist headshot shown on the masthead, next
      // to their name/title/email -- same data: URI approach as
      // clientLogo, uploaded and resized client-side (see
      // fileToLogoDataUrl in Dashboard.js), no separate storage needed.
      contactPhoto: "",
    },
    sectionOrder: DEFAULT_SECTION_ORDER.slice(),
    // Sidebar nav labels, keyed by section id -- editable in edit mode
    // (see the sidebar render in Dashboard.js). Seeded from
    // NAV_SECTIONS' default labels; older saved clients won't have
    // this object at all, so Dashboard.js always falls back to
    // NAV_SECTIONS' label when a key is missing.
    nav: Object.fromEntries(NAV_SECTIONS.map((s) => [s.id, s.label])),
    // User-added sections beyond the built-in seven -- each gets pushed
    // onto sectionOrder under its own generated id when created, so it
    // automatically gets its own nav row and page anchor together (see
    // addCustomSection in Dashboard.js). A custom section's `label` is
    // its own nav text, edited directly at customSections.<i>.label --
    // unlike a built-in section, it doesn't need a separate content.nav
    // override, since nothing else refers to it by a fixed name.
    customSections: [],
    recap: {
      eyebrow: "Performance recap",
      heading: "Add this month's headline",
      note: "A short line of context for the numbers below.",
      stats: [
        { label: "Stat label", value: "0", sub: "context", good: false },
      ],
      footnote: [],
    },
    momentum: { items: [] },
    stores: { items: [] },
    review: { groups: [{ label: "Due date", items: [] }] },
    questions: { items: [] },
    working: {
      columns: [
        { label: "Weekly", items: [] },
        { label: "Monthly", items: [] },
        { label: "Ongoing", items: [] },
      ],
    },
    approved: { items: [] },
    events: { items: [] },
    meetings: { items: [] },
  };
}

// Templates for "+ Add" actions in edit mode -- mirrors the shape
// blankContent() and the seeded data use, so old and new clients stay
// structurally compatible.
export const ITEM_TEMPLATES = {
  momentumItem: () => ({ month: "New month", text: "Add a highlight…" }),
  // tagColor is a plain hex background for the little badge in the
  // store card's top-right corner; its text is freely editable too
  // (see the store card render in Dashboard.js). `cls` no longer gets
  // set on new stores -- it only still exists as a fallback default
  // color for stores saved before this, via CLS_DEFAULT_COLOR in
  // Dashboard.js.
  storeItem: () => ({ name: "New Store", tag: "Steady", tagColor: "#efece2", text: "Add a note…" }),
  footnoteItem: () => "Add a note…",
  reviewGroup: () => ({ label: "New deadline", items: [] }),
  // status/clientComment are set by the client from the portal (via
  // ApprovalWidget + the /respond API route), not edited here by
  // staff -- "pending" is the only status a brand-new item should
  // start in.
  reviewItem: () => ({ title: "New item", store: "All stores", desc: "Add details…", status: "pending", clientComment: "" }),
  questionItem: () => ({ store: "Store", title: "New question", excerpt: "", response: "", status: "pending", clientComment: "" }),
  workingItem: () => "New task item",
  approvedItem: () => "New approved item",
  eventItem: () => ({ mon: "JAN", day: "01", title: "New event", loc: "Location" }),
  meetingItem: () => ({ name: "New meeting", freq: "Frequency", next: "Date" }),
  statItem: () => ({ label: "New stat", value: "0", sub: "context", good: false }),
  // A brand-new, freeform section: a headline, an optional note, and
  // an orderable list of short rich-text cards -- the same shape as
  // Momentum, since that's the simplest "heading + a few cards" layout
  // already in use. `id` is generated once here and never changes, so
  // it stays a stable anchor even if the section gets renamed later.
  customSection: () => ({
    id: `custom-${Math.random().toString(36).slice(2, 8)}`,
    label: "New Section",
    heading: "Add a headline",
    note: "",
    items: [],
  }),
  customSectionItem: () => ({ text: "Add details…" }),
};

// The built-in sections at the sectionOrder level (one entry per
// draggable block on the page -- note "Ready for Review" and
// "Questions & Requests" share a single block, reviewQuestions, since
// they render together as one two-column layout). Used to offer
// "add this section back" once a client has removed it from
// sectionOrder; see Dashboard.js.
export const BUILTIN_SECTIONS = [
  { id: "recap", label: "Performance Recap" },
  { id: "momentum", label: "Momentum" },
  { id: "stores", label: "Store Spotlights" },
  { id: "reviewQuestions", label: "Ready for Review & Questions" },
  { id: "working", label: "Working On" },
  { id: "approved", label: "Approved & Live" },
  { id: "upcoming", label: "Events & Meetings" },
];

export const NAV_SECTIONS = [
  { id: "recap", label: "Performance Recap" },
  { id: "momentum", label: "Momentum" },
  { id: "stores", label: "Store Spotlights" },
  { id: "review", label: "Ready for Review" },
  { id: "questions", label: "Questions & Requests" },
  { id: "working", label: "Working On" },
  { id: "approved", label: "Approved & Live" },
  { id: "upcoming", label: "Events & Meetings" },
];

// Slugify a client name into a URL-safe, unguessable link segment:
// "Timberline Ace Hardware" -> "timberline-ace-hardware-x7k2q9"
export function makeSlug(name) {
  const base = String(name || "client")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || "client"}-${suffix}`;
}
