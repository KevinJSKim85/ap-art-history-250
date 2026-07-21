// Non-destructive build: dedupe by title+artist, validate images with rate-limit
// backoff, replace ONLY confirmed-broken URLs (never blank a working one), and
// emit works.js. Usage: node tools/build.mjs data/works.json [--validate]
import fs from "node:fs";

const EXPECT = { 1:11, 2:36, 3:51, 4:54, 5:14, 6:14, 7:11, 8:21, 9:11, 10:27 };
const AREA_NAME = {
  1:"Global Prehistory",2:"Ancient Mediterranean",3:"Early Europe and Colonial Americas",
  4:"Later Europe and Americas",5:"Indigenous Americas",6:"Africa",7:"West and Central Asia",
  8:"South, East, and Southeast Asia",9:"The Pacific",10:"Global Contemporary"
};
const AREA_SPAN = {
  1:"30,000–500 BCE",2:"3500 BCE–300 CE",3:"200–1750 CE",4:"1750–1980 CE",5:"1000 BCE–1980 CE",
  6:"1100–1980 CE",7:"500 BCE–1980 CE",8:"300 BCE–1980 CE",9:"700–1980 CE",10:"1980 CE–present"
};
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const inPath = process.argv[2] || "data/works.json";
const doValidate = process.argv.includes("--validate");
let works = JSON.parse(fs.readFileSync(inPath, "utf8"));
if (works.works) works = works.works;
console.log(`Loaded ${works.length} works`);

// Normalize Wikimedia image URLs to the sized Special:FilePath form so full-res
// originals don't time out. Non-Wikimedia URLs are left as-is.
function normImg(url) {
  if (!url) return url;
  // upload.wikimedia.org/wikipedia/<lang>/[thumb/]a/ab/FILENAME[/NNNpx-..]
  let m = url.match(/upload\.wikimedia\.org\/wikipedia\/[^/]+\/(?:thumb\/)?[0-9a-fA-F]\/[0-9a-fA-F]{2}\/([^/?]+)/);
  if (m) return "https://commons.wikimedia.org/wiki/Special:FilePath/" + encodeURIComponent(decodeURIComponent(m[1])) + "?width=1200";
  m = url.match(/Special:FilePath\/([^?]+)/);
  if (m) return "https://commons.wikimedia.org/wiki/Special:FilePath/" + m[1] + "?width=1200";
  return url;
}
for (const w of works) w.image_url = normImg(w.image_url);

// normalize + dedupe by title+artist (two different works can share a title)
const seen = new Map();
for (const w of works) {
  w.content_area = +w.content_area;
  w.content_area_name = AREA_NAME[w.content_area] || w.content_area_name || "";
  w.content_area_span = AREA_SPAN[w.content_area] || "";
  const key = (w.title + "|" + (w.artist || "")).toLowerCase().replace(/[^a-z0-9|]/g, "");
  if (!seen.has(key)) seen.set(key, w);
  else console.log(`  dropped exact duplicate: ${w.title} — ${w.artist}`);
}
works = [...seen.values()];
console.log(`After dedupe: ${works.length}`);

async function checkImage(url) {
  // returns true if a definitive image response; retries 429 with backoff
  const backoffs = [0, 1500, 3500, 6000];
  for (let i = 0; i < backoffs.length; i++) {
    if (backoffs[i]) await sleep(backoffs[i]);
    try {
      const r = await fetch(url, { redirect: "follow", headers: { "User-Agent": UA, "Accept": "image/*,*/*" } });
      if (r.status === 429) continue; // rate limited, retry
      const ct = r.headers.get("content-type") || "";
      return r.ok && ct.startsWith("image");
    } catch (e) { if (i === backoffs.length - 1) return false; }
  }
  return false; // exhausted retries on 429 -> treat as reachable but throttled; caller keeps original
}
function wikiTitle(u) { const m = /wikipedia\.org\/wiki\/([^?#]+)/.exec(u || ""); return m ? decodeURIComponent(m[1]) : null; }
async function wikiThumb(title) {
  try {
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, { headers: { "User-Agent": UA } });
    if (!r.ok) return null;
    const j = await r.json();
    return (j.originalimage && j.originalimage.source) || (j.thumbnail && j.thumbnail.source) || null;
  } catch (e) { return null; }
}

if (doValidate) {
  console.log("\nValidating images (concurrency 3, backoff on 429)…");
  let ok = 0, fixed = 0, broken = 0, throttled = 0, idx = 0;
  const brokenList = [];
  async function worker() {
    while (idx < works.length) {
      const w = works[idx++];
      await sleep(120);
      const good = await checkImage(w.image_url);
      if (good) { ok++; continue; }
      // try to repair from wikipedia REST; only replace if a working alt is found
      const t = wikiTitle(w.source_url);
      const alt = t ? await wikiThumb(t) : null;
      if (alt && await checkImage(alt)) { w.image_url = alt; fixed++; continue; }
      // keep original URL (browser may still load it); just record
      broken++; brokenList.push(`[${w.content_area}] ${w.title}`);
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  console.log(`Images — ok:${ok} repaired:${fixed} unconfirmed:${broken}`);
  if (brokenList.length) { console.log("Unconfirmed (kept original URL, browser fallback if it fails):"); brokenList.forEach(b => console.log("  " + b)); }
}

console.log("\nPer-area counts (got / expected):");
let total = 0;
for (let a = 1; a <= 10; a++) {
  const n = works.filter(w => w.content_area === a).length;
  total += n;
  console.log(`  ${a}. ${AREA_NAME[a]}: ${n} / ${EXPECT[a]}  ${n === EXPECT[a] ? "ok" : (n < EXPECT[a] ? "LOW" : "high")}`);
}
console.log(`  TOTAL: ${total} / 250`);

works.sort((a, b) => a.content_area - b.content_area || 0);
const out = "/* Compiled AP Art History 250 dataset. Generated by tools/build.mjs */\n" +
  "window.APAH_WORKS = " + JSON.stringify(works) + ";\n";
fs.writeFileSync("works.js", out);
fs.writeFileSync("data/works.clean.json", JSON.stringify(works, null, 2));
console.log(`\nWrote works.js (${works.length} works)`);
