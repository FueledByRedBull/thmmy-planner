# Η εβδομάδα μου · ΤΗΜΜΥ

A personal timetable planner for the University of Thessaly's Electrical and Computer Engineering department.

[Open the planner](https://fueledbyredbull.github.io/thmmy-planner/)

GitHub Pages serves `index.html` with separate JavaScript, styles, Greek fonts and public course snapshots:

```text
index.html
assets/
  styles.css
  app.js
  source-parser.js
  fonts/
data/
  courses.json
  guide.json
```

Open the split site over HTTP/HTTPS, keeping these folders together. For double-click/offline use, open `outputs/THMMY-programma.html`, which embeds everything. Refreshing the official timetable needs an internet connection. The hosted app's HTML backup action fetches and embeds its assets; the resulting backup works offline with your selections.

Selections, passed courses, review flags and preferences are stored in the current browser. Personal data is never embedded in the public build. The existing THMMY1 export/import codes remain compatible.

## Development

Use Node.js 18 or newer to rebuild from the HTML, CSS and JavaScript sources. No package installation is needed.

```sh
node work/build.mjs
```

The build writes the split Pages files above and `outputs/THMMY-programma.html` for standalone use. Commit `index.html`, `assets/` and `data/` together with source changes. Asset URLs include content versions so changes do not reuse stale browser caches. GitHub Pages serves the root of `main`; no server or runtime packages are required.

Edit the sources in `work/`, then rebuild; `assets/` and `data/` are generated outputs. `work/app.js` contains the planner, storage and print logic. `work/template.html`, `work/app.css` and the public data/font files complete the build.

Embedded font license information is in `work/font-licenses.txt`.
