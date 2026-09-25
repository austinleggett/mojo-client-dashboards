// Seeds the real Timberline Ace Hardware dashboard, carried over from
// the original Claude Artifact prototype, so the first client in the
// new app isn't a blank page. Run with: npm run seed
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const timberlineContent = {
  meta: {
    clientName: "Timberline Ace Hardware",
    tagline: "6 locations · Western Colorado · September 2026",
    contactName: "Kayla Murphy",
    contactTitle: "Marketing Strategist, Mountain Mojo Group",
    contactEmail: "kayla@mountainmojogroup.com",
    contactPhone: "480-292-0273",
    footerNote: "Prepared for Timberline Ace Hardware · Updated monthly",
    updatedAt: "2026-09-15T00:00:00.000Z",
  },
  recap: {
    eyebrow: "Performance recap · shared at our Aug 26 check-in",
    heading: "July was a strong month",
    note: "The headline numbers across all six stores, reported at our last monthly check-in.",
    stats: [
      { label: "July sales", value: "$2.02M", sub: "+13.6% YoY (+$241K)", good: true },
      { label: "Google search impressions", value: "+66%", sub: "month over month", good: false },
      { label: "Google search clicks", value: "+28%", sub: "month over month", good: false },
      { label: "Qualified phone calls", value: "64.5%", sub: "vs. our 50% goal", good: true },
      { label: "Shop-online clicks", value: "+19.3%", sub: "month over month", good: false },
    ],
    footnote: [
      "89 guests at Battlement Mesa's July 4th cookout",
      '1,781 direction requests from "hardware store near me" searches',
      "Email newsletter hit its 15%+ open-rate goal",
    ],
  },
  momentum: {
    items: [
      { month: "April", text: "Breakout month — about $63.3K in forecasted marketing-driven revenue, plus 537 newly verified first-time customers." },
      { month: "May", text: "2,494 tracked phone calls, 88% answered. Tracked digital revenue nearly doubled month over month." },
      { month: "June", text: "$56,332 in fulfilled eCommerce sales (+49.5%) at a 4.7x modeled ROI — above our 4.0x benchmark." },
      { month: "July", text: "$2.02M in sales, +13.6% year over year, with local search clicks up 208%." },
    ],
  },
  stores: {
    items: [
      { name: "Battlement Mesa", tag: "Event month", cls: "event", text: "Labor Day Cookout (9/1) and the Dog Adoption Event (9/19) both run this month — July 4th's cookout drew 89 guests." },
      { name: "Carbondale", tag: "Event this month", cls: "event", text: "Labor Day Grilling Event alongside Battlement Mesa, Sept 8, 11am–2pm." },
      { name: "Clifton", tag: "Needs your input", cls: "needs", text: "Awaiting your sign-off on a Google review response, plus a B2B push to reach contractors after two local suppliers exited irrigation/plumbing supply." },
      { name: "Aspen", tag: "Needs a decision", cls: "needs", text: "Final window signage is on hold — we've recommended perforated window film so customers can still see inside." },
      { name: "Norwood", tag: "Steady", cls: "steady", text: "Its summer community event drew 100+ attendees — no open items this month." },
      { name: "Telluride", tag: "Steady", cls: "steady", text: "Local search visibility climbing alongside Aspen, Carbondale & Clifton — no open items this month." },
    ],
  },
  review: {
    groups: [
      {
        label: "Due Tuesday, 9/8",
        items: [
          { title: "Store Visit Sneak-Peek Content", store: "All stores", desc: "Photo & video pulled from this round of store visits — ready for a look before we schedule it out." },
          { title: "Dog Adoption Event — ad, listing & posts", store: "Battlement Mesa", desc: "FB ad live 9/9–9/19, $100 budget, goal is event RSVPs. Website listing, GMB post and social post are drafted alongside it." },
          { title: "Labor Day Cookout — ad, listing & posts", store: "Battlement Mesa & Carbondale", desc: "$100 ad budget each, running 9/1–9/7, with a matching website listing, GMB post and social post per store." },
          { title: "Red Hot Buys & September Digital Savings Event", store: "All stores", desc: "Both event pages are live on the site and ready for your review." },
          { title: "September website updates", store: "All stores", desc: "Savings / Red Hot Buys page and the B2B Red Hot Buys page." },
          { title: "September social ads", store: "All stores", desc: "Email Leads ad ($900, runs 9/3–9/27) and the Labor Day Engagement ad ($400, runs 9/1–9/14)." },
        ],
      },
      {
        label: "Due Monday, 9/14",
        items: [
          { title: "October blog — Winter Home Maintenance Checklist", store: "All stores", desc: "Drafted and ready for your review before it publishes next month." },
        ],
      },
      {
        label: "On hold",
        items: [
          { title: "Final window signage", store: "Aspen & Battlement Mesa", desc: "Holding for your call on material — we're recommending perforated window film so customers can still see inside." },
        ],
      },
    ],
  },
  questions: {
    items: [
      {
        store: "Clifton",
        title: "Google review needs a response",
        excerpt: "“I had a really off-putting experience about a week ago... I believe the associate's name was Gerry or Terry.”",
        response: "We've drafted a reply and want your sign-off before it posts — want us to loop in the store lead first, or post as-is?",
      },
      {
        store: "All stores",
        title: "Yelp login access",
        excerpt: "In progress — Mary's looking into this.",
        response: "All 6 stores' Yelp profiles are now claimed and updated. Send over login credentials when you can and we'll start optimizing each store's page.",
      },
    ],
  },
  working: {
    columns: [
      { label: "Weekly", items: ["Timely social content & community engagement — all 6 stores", "Social ad management", "Google Business Profile updates"] },
      { label: "Monthly", items: ["On-page SEO updates", "Website content — Red Hot Buys page, homepage sliders, B2B page", "September email newsletter"] },
      { label: "Ongoing", items: ["Co-op ad research", "Store visit content organization"] },
    ],
  },
  approved: {
    items: [
      "Photoshoot content library", "In-store GBP signage (all registers)", "Register & event/giveaway email sign-up sheets",
      "Timberline-branded email signatures (all stores)", "Sponsorship sheet", "Google review lanyards",
      "Battlement Mesa Dog Adoption flyers", "Clifton B2B plumbing/irrigation flyer", "Brand style guide & logo guide",
      "B2B toolkit — register script, pro paint guide, coupon, door hangers", "Internal team newsletter", "September social content — all 6 stores",
    ],
  },
  events: {
    items: [
      { mon: "SEP", day: "01", title: "Labor Day Sale begins (digital only)", loc: "All stores" },
      { mon: "SEP", day: "08", title: "Labor Day Grilling Event, 11am–2pm", loc: "Battlement Mesa & Carbondale" },
      { mon: "SEP", day: "19", title: "Dog Adoption Event, 12–3pm", loc: "Battlement Mesa · monthly community event" },
      { mon: "SEP", day: "01", title: "Fall Fix It Giveaway & Red Hot Buys run all month", loc: "All stores" },
    ],
  },
  meetings: {
    items: [
      { name: "Monthly Check-In", freq: "4th Wednesday of each month, 10:30am MST", next: "Sep 23" },
      { name: "Store Manager Sync", freq: "3rd Wednesday of each quarter's first month, 11:30am MST", next: "Oct 21" },
    ],
  },
};

async function main() {
  const slug = "timberline-ace-hardware";
  const client = await prisma.client.upsert({
    where: { slug },
    update: { content: timberlineContent },
    create: {
      slug,
      name: "Timberline Ace Hardware",
      accentColor: "#1f4d3a",
      content: timberlineContent,
    },
  });
  console.log(`Seeded client: ${client.name} -> /c/${client.slug}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
