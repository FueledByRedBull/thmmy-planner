# Η εβδομάδα μου · ΤΗΜΜΥ

A personal timetable planner for the University of Thessaly's Electrical and Computer Engineering department.

[Open the planner](https://fueledbyredbull.github.io/thmmy-planner/)

GitHub Pages serves `index.html` with separate JavaScript, styles, Greek fonts and public course snapshots:

```text
index.html
sw.js              service worker: instant repeat visits, offline use, update prompt
manifest.webmanifest  install as an app (icons in assets/icons/)
assets/
  styles.css
  app.js
  source-parser.js
  motion.js        smooth scrolling, lazy-loads the 3D week
  week3d.js        bundled from src/week3d.js
  vendor/lenis.min.js
  fonts/
  icons/
data/
  courses.json
  guide.json
src/
  week3d.js        source of the 3D week (Three.js)
```

Open the site over HTTP/HTTPS, keeping these folders together. After the first visit the service worker keeps every file on the device: later visits open from it instantly and the planner works offline (refreshing the official timetable still needs a connection). The site can also be installed as an app. The app's HTML backup action fetches and embeds its assets; the resulting backup works offline with your selections.

Selections, passed courses, review flags and preferences are stored in the current browser. Personal data is never embedded in the public build. Transfer codes are short `THMMY2:` strings that hold only your choices (the timetable reloads from the public source); older `THMMY1.` codes still import.

## Development

This folder is the source: edit `index.html`, `assets/` and `data/` directly. GitHub Pages serves the root of `main`; no server or runtime packages are required. When an asset changes, bump its `?v=` query in `index.html` (or in `assets/motion.js` for `week3d.js`) so browsers do not reuse a stale cache. The data files and `app.js` are also preloaded in the `<head>` of `index.html`: keep those URLs identical to the ones the loader uses, or the preload is wasted.

The 3D week is the one bundled file. After editing `src/week3d.js`, rebuild it with esbuild 0.28 and three 0.186.1:

```sh
npm install --no-save esbuild@0.28.2 three@0.186.1
npx esbuild src/week3d.js --bundle --minify --format=esm --legal-comments=eof --outfile=assets/week3d.js
```

Updates reach visitors through `sw.js` with no extra step: the page asks it to check for a new `index.html` when it loads, when it comes back into view and every half hour. A changed page has its files (read from `index.html`, `assets/motion.js` and `assets/styles.css`) cached first, then the page shows a "new version" prompt whose reload is instant. Change `CACHE` in `sw.js` only when its own caching changes; the new worker then waits behind the prompt too. If a published `sw.js` ever misbehaves, replace it with one whose `install` and `activate` handlers call `self.registration.unregister()`.

Design decisions are recorded in `DESIGN.md` and `PRODUCT.md`.

Font licenses (SIL Open Font License 1.1) are in `assets/fonts/OFL.txt`. Lenis keeps its MIT notice in `assets/vendor/lenis.min.js`, and the Three.js license is appended to `assets/week3d.js`.
