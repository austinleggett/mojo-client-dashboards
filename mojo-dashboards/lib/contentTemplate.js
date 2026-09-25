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
    },
    sectionOrder: DEFAULT_SECTION_ORDER.slice(),
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
  storeItem: () => ({ name: "New Store", tag: "Steady", cls: "steady", text: "Add a note…" }),
  footnoteItem: () => "Add a note…",
  reviewGroup: () => ({ label: "New deadline", items: [] }),
  reviewItem: () => ({ title: "New item", store: "All stores", desc: "Add details…" }),
  questionItem: () => ({ store: "Store", title: "New question", excerpt: "", response: "" }),
  workingItem: () => "New task item",
  approvedItem: () => "New approved item",
  eventItem: () => ({ mon: "JAN", day: "01", title: "New event", loc: "Location" }),
  meetingItem: () => ({ name: "New meeting", freq: "Frequency", next: "Date" }),
  statItem: () => ({ label: "New stat", value: "0", sub: "context", good: false }),
};

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

export const TAG_OPTIONS = [
  { cls: "event", label: "Event" },
  { cls: "needs", label: "Needs input" },
  { cls: "steady", label: "Steady" },
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
