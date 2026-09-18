(function (root) {
  'use strict';

  const SITE_ORIGIN = 'https://www.e-ce.uth.gr/';
  const SITE_HOSTS = new Set(['e-ce.uth.gr', 'www.e-ce.uth.gr']);
  const SOURCE_URLS = Object.freeze({
    fall: 'https://www.e-ce.uth.gr/studies/undergraduate/fall-timetable/year/',
    spring: 'https://www.e-ce.uth.gr/studies/undergraduate/spring-timetable/year/'
  });
  const DAY_INDEX = new Map([
    ['δευτερα', 0], ['τριτη', 1], ['τεταρτη', 2], ['πεμπτη', 3], ['παρασκευη', 4]
  ]);

  function fail(message) {
    throw new Error(`SourceParser: ${message}`);
  }

  function text(node) {
    return String(node && node.textContent || '').replace(/\s+/gu, ' ').trim();
  }

  function folded(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLocaleLowerCase('el-GR')
      .replace(/ς/gu, 'σ')
      .replace(/[^\p{L}\p{N}]+/gu, '');
  }

  function parser() {
    const Parser = root.DOMParser;
    if (typeof Parser !== 'function') fail('DOMParser is unavailable');
    return Parser;
  }

  function documentFrom(html) {
    if (typeof html !== 'string' || !html.trim()) fail('HTML source is empty');
    return new (parser())().parseFromString(html, 'text/html');
  }

  function seasonName(season) {
    const value = String(season || '').trim().toLowerCase();
    if (value === 'fall' || value === 'spring') return value;
    fail(`unknown season: ${season}`);
  }

  function safeUrl(raw, base) {
    const value = String(raw || '').trim();
    if (!value || value === '#') return null;
    let parsed;
    try {
      parsed = new URL(value, base || SITE_ORIGIN);
    } catch (error) {
      fail(`invalid URL: ${value}`);
    }
    if (parsed.protocol !== 'https:' || !SITE_HOSTS.has(parsed.hostname.toLowerCase())) {
      fail(`unsafe URL: ${value}`);
    }
    return parsed.href;
  }

  function sourceUrl(doc, season) {
    const link = doc.querySelector('link[rel~="canonical"]');
    return link ? safeUrl(link.getAttribute('href')) : SOURCE_URLS[season];
  }

  function sourceTitle(doc) {
    return text(doc.querySelector('#page-heading h1') || doc.querySelector('main h1') || doc.querySelector('h1') || doc.querySelector('title'));
  }

  function validateTitle(doc, season) {
    const title = folded(sourceTitle(doc));
    if (!title) fail('source title is missing');
    const expected = season === 'fall' ? ['χειμεριν', 'fall'] : ['εαριν', 'spring'];
    if (!title.includes('ωρολογ') || !expected.some(part => title.includes(part))) fail(`source title does not match ${season}`);
  }

  function validateCanonical(doc, expectedPath) {
    const link = doc.querySelector('link[rel~="canonical"]');
    if (!link) return;
    const url = safeUrl(link.getAttribute('href'));
    if (new URL(url).pathname !== expectedPath) fail(`canonical URL does not match ${expectedPath}`);
  }

  function tabsFor(doc) {
    const host = doc.querySelector('.tabs');
    if (!host) fail('tabs container is missing');
    const tabs = Array.from(host.children).filter(node => node.classList.contains('tab_content'));
    if (!tabs.length) fail('timetable tabs are missing');
    return tabs;
  }

  function requiredTabs(doc) {
    const host = doc.querySelector('.tabs');
    if (!host) fail('tabs container is missing');
    return ['tabs-1-1', 'tabs-1-2', 'tabs-1-3'].map(id => {
      const tab = Array.from(host.children).find(node => node.id === id && node.classList.contains('tab_content'));
      if (!tab) fail(`catalog tab ${id} is missing`);
      return tab;
    });
  }

  function sections(tab, label) {
    const result = Array.from(tab.querySelectorAll('.accordion_content'));
    if (!result.length) fail(`${label} sections are missing`);
    return result;
  }

  function sectionHeader(section) {
    const previous = section.previousElementSibling;
    return text(previous && (previous.querySelector('a') || previous));
  }

  function wrappers(section, label) {
    const result = Array.from(section.children).filter(node => node.classList.contains('toggle_ajax-wrap'));
    if (!result.length) fail(`${label} section has no courses`);
    return result;
  }

  function courseHeading(item) {
    return text(Array.from(item.children).find(node => node.tagName === 'H3') || item.querySelector('h3'));
  }

  function courseParts(item, label) {
    const wpId = String(item.getAttribute('id') || '').trim();
    if (!/^\d+$/u.test(wpId)) fail(`${label} course has an invalid WP id`);
    const heading = courseHeading(item);
    const match = heading.match(/^(ECE\d+)\s+(.+)$/iu);
    if (!match || !match[2].trim()) fail(`${label} course has an invalid ECE heading`);
    const hrefs = Array.from(item.querySelectorAll('a[href]')).map(node => safeUrl(node.getAttribute('href')));
    const url = hrefs.find(Boolean) || null;
    return { id: match[1].toUpperCase(), wpId, name: match[2].trim(), url };
  }

  function semesterNumber(value) {
    const match = String(value || '').match(/(?:εξάμηνο\s*[-:]?\s*(\d{1,2}))|(\d{1,2})\s*(?:ο|ου)?\s*εξάμηνο/iu);
    const number = Number(match && (match[1] || match[2]));
    if (!Number.isInteger(number) || number < 1 || number > 10) fail(`invalid semester heading: ${value}`);
    return number;
  }

  function addCourse(state, parts, semester) {
    const existing = state.byId.get(parts.id);
    if (existing) {
      if (existing.wpId !== parts.wpId || existing.name !== parts.name) fail(`conflicting course ${parts.id}`);
      if (semester != null && existing.semester != null && existing.semester !== semester) fail(`conflicting semester for ${parts.id}`);
      if (existing.semester == null) existing.semester = semester;
      if (!existing.url && parts.url) existing.url = parts.url;
      return existing;
    }
    const wpMatch = state.byWpId.get(parts.wpId);
    if (wpMatch && wpMatch.id !== parts.id) fail(`WP id ${parts.wpId} is reused`);
    const course = {
      id: parts.id,
      wpId: parts.wpId,
      name: parts.name,
      semester: semester == null ? null : semester,
      domain: null,
      mandatory: false,
      url: parts.url
    };
    state.byId.set(course.id, course);
    state.byWpId.set(course.wpId, course);
    state.courses.push(course);
    return course;
  }

  function parseCatalog(html) {
    const doc = documentFrom(html);
    const title = folded(sourceTitle(doc));
    if (!title || !title.includes('προπτυχια') || !title.includes('μαθημ')) fail('source title is not the undergraduate course catalog');
    validateCanonical(doc, '/studies/undergraduate/courses/');
    const [domainTab, semesterTab, mandatoryTab] = requiredTabs(doc);
    const state = { courses: [], byId: new Map(), byWpId: new Map(), requirements: new Map() };

    for (const section of sections(semesterTab, 'semester')) {
      const semester = semesterNumber(sectionHeader(section));
      for (const item of wrappers(section, 'semester')) addCourse(state, courseParts(item, 'semester'), semester);
    }

    for (const section of sections(domainTab, 'domain')) {
      const domain = sectionHeader(section);
      if (!domain) fail('domain section header is missing');
      for (const item of wrappers(section, 'domain')) {
        const course = addCourse(state, courseParts(item, 'domain'));
        if (course.domain && course.domain !== domain) fail(`conflicting domain for ${course.id}`);
        course.domain = domain;
      }
    }

    for (const section of sections(mandatoryTab, 'mandatory')) {
      const header = folded(sectionHeader(section));
      const mandatory = header.includes('υποχρεωτ');
      if (!mandatory && !header.includes('επιλογ')) fail('mandatory section header is unknown');
      for (const item of wrappers(section, 'mandatory')) {
        const course = addCourse(state, courseParts(item, 'mandatory'));
        const previous = state.requirements.get(course.id);
        if (previous != null && previous !== mandatory) fail(`conflicting requirement for ${course.id}`);
        state.requirements.set(course.id, mandatory);
        course.mandatory = mandatory;
      }
    }

    for (const course of state.courses) {
      if (course.semester == null) fail(`course ${course.id} has no semester`);
    }
    return state.courses;
  }

  function dayNumber(value) {
    const number = DAY_INDEX.get(folded(value));
    if (number == null) fail(`unknown day: ${value}`);
    return number;
  }

  function timeRange(value) {
    const match = String(value || '').match(/^(\d{1,2}):(\d{2})\s*[-–—−]\s*(\d{1,2}):(\d{2})$/u);
    if (!match) fail(`invalid time range: ${value}`);
    const startHour = Number(match[1]);
    const startMinute = Number(match[2]);
    const endHour = Number(match[3]);
    const endMinute = Number(match[4]);
    if ([startHour, endHour].some(hour => hour > 23) || [startMinute, endMinute].some(minute => minute > 59)) fail(`invalid time range: ${value}`);
    const start = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;
    if (end <= start) fail(`time range does not advance: ${value}`);
    return { start, end };
  }

  function catalogIndex(catalog) {
    if (!Array.isArray(catalog)) fail('catalog must be an array');
    const byId = new Map();
    const byWpId = new Map();
    const byName = new Map();
    const byUrl = new Map();
    for (const course of catalog) {
      if (!course || !course.id || !course.wpId || !course.name) fail('catalog contains an incomplete course');
      if (byId.has(course.id) || byWpId.has(String(course.wpId))) fail(`catalog contains duplicate course ${course.id}`);
      byId.set(course.id, course);
      byWpId.set(String(course.wpId), course);
      const name = folded(course.name);
      const matches = byName.get(name) || [];
      matches.push(course);
      byName.set(name, matches);
      if (course.url) byUrl.set(safeUrl(course.url), course);
    }
    return { byId, byWpId, byName, byUrl };
  }

  function courseFromUrl(url, index) {
    if (!url) return null;
    const parsed = new URL(url);
    const direct = index.byUrl.get(url);
    if (direct) return direct;
    for (const key of ['course', 'course_id', 'courseId', 'wpId', 'post', 'post_id', 'p', 'id']) {
      const value = parsed.searchParams.get(key);
      if (value && index.byWpId.has(value)) return index.byWpId.get(value);
    }
    const path = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '');
    const pathMatches = index.byName.get(folded(path));
    return pathMatches && pathMatches.length === 1 ? pathMatches[0] : null;
  }

  function courseFromName(name, index) {
    const matches = index.byName.get(folded(name)) || [];
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) fail(`course name is ambiguous: ${name}`);
    return null;
  }

  function eventId(season, courseId, day, start, end, type, room) {
    return [season, courseId, day, start, end, type, room].map(value => encodeURIComponent(String(value))).join('|');
  }

  function parseTimetable(html, season, catalog) {
    const chosenSeason = seasonName(season);
    const doc = documentFrom(html);
    validateTitle(doc, chosenSeason);
    validateCanonical(doc, `/studies/undergraduate/${chosenSeason}-timetable/year/`);
    const source = sourceUrl(doc, chosenSeason);
    const index = catalogIndex(catalog);
    const events = [];
    const seen = new Map();

    for (const tab of tabsFor(doc)) {
      const semesterHeading = tab.querySelector('h2');
      const semester = semesterNumber(text(semesterHeading));
      const wraps = Array.from(tab.children).filter(node => node.classList.contains('toggle-wrap'));
      if (wraps.length !== 5) fail(`semester ${semester} does not have five day blocks`);
      const days = new Set();
      for (const wrap of wraps) {
        const trigger = wrap.querySelector('.trigger');
        if (!trigger) fail(`semester ${semester} has a day block without a trigger`);
        const day = dayNumber(text(trigger));
        if (days.has(day)) fail(`semester ${semester} repeats a day`);
        days.add(day);
        for (const row of wrap.querySelectorAll('tr.sbody')) {
          const cells = Array.from(row.children).filter(node => node.tagName === 'TD');
          if (cells.length !== 5) fail(`semester ${semester} day ${day} has a partial row`);
          const values = cells.map(text);
          if (values.slice(0, 3).some(value => !value)) fail(`semester ${semester} day ${day} has an empty row cell`);
          const range = timeRange(values[0]);
          const hrefs = Array.from(cells[1].querySelectorAll('a[href]')).map(node => safeUrl(node.getAttribute('href')));
          const url = hrefs.find(Boolean) || null;
          const course = courseFromUrl(url, index) || courseFromName(values[1], index);
          if (!course) fail(`timetable course is not in the catalog: ${values[1]}`);
          if (url && !course.url) {
            course.url = url;
            index.byUrl.set(url, course);
          }
          const id = eventId(chosenSeason, course.id, day, range.start, range.end, values[2], values[3]);
          const event = {
            id,
            courseId: course.id,
            semester,
            day,
            start: range.start,
            end: range.end,
            type: values[2],
            room: values[3],
            teacher: values[4],
            url
          };
          const duplicate = seen.get(id);
          if (duplicate) {
            if (JSON.stringify(duplicate) !== JSON.stringify(event)) fail(`conflicting duplicate event ${id}`);
            continue;
          }
          seen.set(id, event);
          events.push(event);
        }
      }
      const directWraps = new Set(wraps);
      const outsideRows = Array.from(tab.querySelectorAll('tr.sbody')).filter(row => !directWraps.has(row.closest('.toggle-wrap')));
      if (outsideRows.length) fail(`semester ${semester} has rows outside a day block`);
      for (const table of tab.querySelectorAll('table')) {
        for (const row of table.querySelectorAll('tr')) {
          const cells = Array.from(row.children).filter(node => node.tagName === 'TD');
          if (cells.length && !row.classList.contains('sbody')) fail(`semester ${semester} has an unexpected table row`);
        }
      }
    }

    return {
      events,
      published: events.length > 0,
      sourceUrl: source,
      fetchedAt: new Date().toISOString()
    };
  }

  root.SourceParser = { parseCatalog, parseTimetable };
})(globalThis);
