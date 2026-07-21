# AP Art History · 250 Required Works

A study site for the complete College Board AP Art History image set (250 required works). Flashcards with a spaced-repetition scheduler, a searchable gallery, and per-work detail pages. Descriptions are in English with a Korean summary; titles stay in the original.

## Features

- **Spaced repetition** — an SM-2 scheduler (Again / Hard / Good / Easy) tracks each work and resurfaces it when due. Progress is saved in the browser (localStorage).
- **Study by area** — study all 250 or focus on a single content area.
- **Browse & search** — filter by content area, search by title, artist, culture, medium, or location.
- **Detail pages** — full metadata plus English and Korean descriptions, with previous/next navigation.
- **History navigation** — the in-app back/forward buttons and the browser's own back/forward both work (hash routing).
- **Works anywhere** — a static site, mobile-first, no build step, no account. Light and dark themes.

## Images

Images are loaded from Wikimedia Commons via the stable `Special:FilePath` endpoint. They are not redistributed in this repository.

## Running locally

Any static file server works:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Files

- `index.html` — shell and top bar
- `styles.css` — styling
- `app.js` — router, spaced-repetition engine, views
- `works.js` — the 250-work dataset (`window.APAH_WORKS`)

## Note on accuracy

Metadata and descriptions were compiled from public references (Smarthistory, Wikipedia). Verify specifics against the official College Board Course and Exam Description before relying on them for the exam.
