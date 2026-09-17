# Η εβδομάδα μου · ΤΗΜΜΥ

A personal timetable planner for the University of Thessaly's Electrical and Computer Engineering department.

[Open the planner](https://fueledbyredbull.github.io/thmmy-planner/)

The published `index.html` is self-contained: JavaScript, styles, Greek fonts and public course snapshots are embedded. It runs on GitHub Pages and as a downloaded HTML file. Refreshing the official timetable needs an internet connection; planning with saved data does not.

Selections, passed courses, review flags and preferences are stored in the current browser. Personal data is never embedded in the public build. The existing THMMY1 export/import codes remain compatible.

## Development

Use Node.js 18 or newer to rebuild from the HTML, CSS and JavaScript sources. No package installation is needed.

```sh
node work/build.mjs
```

The build writes both `index.html` for Pages and `outputs/THMMY-programma.html` for standalone use. Commit the generated `index.html` with source changes. GitHub Pages serves the root of `main`; no server or runtime packages are required.

`work/app.js` contains the planner, storage and print logic. `work/template.html`, `work/app.css` and the embedded public data/font files complete the build.

Embedded font license information is in `work/font-licenses.txt`.
