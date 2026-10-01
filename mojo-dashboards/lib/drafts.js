// Server-side helpers for the Weekly / Monthly tabs and their drafts.
import { getPath, setPath } from "@/lib/path";

const plain = (html) =>
  String(html ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

// The shared `meta` (client name, logo, contact...) always lives on
// the live weekly content. Tab content saved anywhere else has it
// stripped, and what's rendered gets it merged back in.
export function withoutMeta(doc) {
  if (!doc || typeof doc !== "object") return doc;
  const { meta, ...rest } = doc;
  return rest;
}

// A client approves or comments on the published page while staff have
// a draft open: the same response is copied onto the matching item in
// the draft (same section, same title text), so publishing the draft
// never wipes out what the client said. Items that only exist in the
// draft, or were renamed there, simply don't get a match.
export function mirrorResponseIntoDraft(liveDoc, draftDoc, path, value) {
  if (!draftDoc) return draftDoc;
  const m = /^(.*\.items)\.(\d+)\.(status|clientComment)$/.exec(path);
  if (!m) return draftDoc;
  const [, listPath, idx, field] = m;
  const liveItem = getPath(liveDoc, `${listPath}.${idx}`);
  if (!liveItem) return draftDoc;
  const key = plain(liveItem.title || liveItem.name);
  if (!key) return draftDoc;

  // Review items live in groups whose order may differ in the draft, so
  // search every group for them; everything else is one flat list.
  const candidates = [];
  if (listPath.startsWith("review.groups.")) {
    (getPath(draftDoc, "review.groups") || []).forEach((g, gi) =>
      (g.items || []).forEach((it, ii) => candidates.push([`review.groups.${gi}.items.${ii}`, it]))
    );
  } else {
    (getPath(draftDoc, listPath) || []).forEach((it, ii) => candidates.push([`${listPath}.${ii}`, it]));
  }
  const hit = candidates.find(([, it]) => plain(it.title || it.name) === key);
  return hit ? setPath(draftDoc, `${hit[0]}.${field}`, value) : draftDoc;
}
