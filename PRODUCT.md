# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Students of the Department of Electrical & Computer Engineering (ΤΗΜΜΥ), University of Thessaly: the owner and a few classmates. They open it before and during a semester to decide which courses to take, see how those courses fit into a week, and check the choice against the study-guide rules before the official registration.

## Product Purpose

"Η εβδομάδα μου" is a personal weekly timetable planner. Students pick courses from the department catalog, and the app lays out their hours and rooms on a week grid. It flags overlaps and totals hours and ECTS, then checks the selection against the 2024–25 study guide (prerequisites, semester limits, passed courses). Success means a student leaves with a conflict-aware week they trust and can print.

## Positioning

It is built on the department's own published timetables (e-ce.uth.gr) and study-guide rules. It isn't a generic calendar: it knows ΤΗΜΜΥ courses, codes, semesters, labs, and registration rules. It is unofficial, and the official registration still happens in the Ηλεκτρονική Γραμματεία.

## Operating Context

- It is used on laptops and phones around registration periods and during the semester (Χειμερινό / Εαρινό seasons).
- There are no accounts. All state (selections, passed courses, profile, colors, theme) lives in the browser's localStorage and moves between devices through a short THMMY2 transfer code (choices only; the timetable itself is reloaded from the source) or file. Older THMMY1 codes, which embed the whole timetable, still import.
- Data refresh fetches public e-ce.uth.gr pages through Jina Reader, AllOrigins, or directly. Users can also import a saved official HTML page manually.
- Printing or saving the week as a PDF is a core ritual.

## Capabilities and Constraints

- The capabilities are course catalog search and filters (semester, offered/selected/all/passed), fall/spring season switch, and a week calendar with overlap detection. The app also offers color by semester or course, course detail dialogs, a study profile, a program/registration check panel, a study-guide rules dialog, sources and refresh, data transfer (export/import code), a self-contained HTML copy download, a light/dark/system theme, and print.
- **Must keep working:** the GitHub Pages version (static `index.html` + `assets/` + `data/`) and print/PDF output.
- The standalone `THMMY-programma.html` is not a required target and may drift from the redesigned version.
- New dependencies are allowed. The CSP in `index.html` currently limits scripts, styles, and fonts to self-hosted assets, so any new asset must be vendored or the CSP updated deliberately.
- The UI language is Greek (`lang="el"`), and all copy is Greek.

## Brand Commitments

- Name: "Η εβδομάδα μου · ΤΗΜΜΥ". The ΗΜΜΥ mark and the "ΠΑΝΕΠΙΣΤΗΜΙΟ ΘΕΣΣΑΛΙΑΣ" line appear in the current masthead.
- Voice: short, direct, second-person Greek ("Διάλεξε μαθήματα. Δες πώς συναντιούνται μέσα στην εβδομάδα.").
- The user asked for a full visual redesign with motion graphics and skeleton loaders. The existing look is evidence only, not something to preserve.

## Evidence on Hand

- `data/courses.json` holds the catalog plus fall and spring timetables. `data/guide.json` holds the 2024–25 study-guide rules, checks, and uncertainties.
- Self-hosted Noto fonts are in `assets/fonts/`.
- There are no testimonials, usage numbers, or endorsements. Do not fabricate any, and do not imply the department officially endorses the app.

## Product Principles

1. The week is the product: every screen serves seeing and trusting the timetable.
2. Be honest about the source. Show where data came from and when, and never present the app's checks as the official registration.
3. Everything stays local: no accounts, and the user's data never leaves the browser without an explicit action.
4. The app must work in the moment of use, including on a phone between classes and on paper once printed.

## Accessibility & Inclusion

The UI is Greek-first. It needs keyboard-operable dialogs and calendar, and motion must respect `prefers-reduced-motion`.
