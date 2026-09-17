(() => {
 type MotionPreference = 'full' | 'reduced';
 type Command = { label: string; hint: string; run: () => void };
 const get = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing interface element: ${id}`);
  return element as T;
 };
 const root = document.documentElement;
 const reduced = matchMedia('(prefers-reduced-motion: reduce)');
 const motionButton = get<HTMLButtonElement>('motionToggle');
 const visualStyle = get<HTMLStyleElement>('experience-style');
 const effects = get<HTMLDivElement>('effectLayer');
 effects.replaceChildren();
 const animations = new Set<Animation>();
 let preference: MotionPreference = root.dataset.motionPreference === 'reduced' ? 'reduced' : 'full';
 let printing = false;
 try { const saved = localStorage.getItem('thmmy-planner-motion'); if (saved === 'full' || saved === 'reduced') preference = saved; } catch {}
 const canMove = (): boolean => preference === 'full' && !reduced.matches && !printing && !document.hidden;
 function cancelMotion(): void { for (const animation of animations) animation.cancel(); animations.clear(); effects.replaceChildren(); }
 function updateMotion(): void {
  root.dataset.motionPreference = preference;
  root.dataset.motion = canMove() ? 'full' : 'reduced';
  motionButton.setAttribute('aria-pressed', String(canMove()));
  motionButton.disabled = reduced.matches;
  motionButton.title = reduced.matches ? 'Η μειωμένη κίνηση είναι ενεργή στις ρυθμίσεις του συστήματος.' : 'Ενεργοποίηση ή παύση των εφέ κίνησης';
  get('motionLabel').textContent = canMove() ? 'Κίνηση ενεργή' : 'Ήπια κίνηση';
  if (!canMove()) cancelMotion();
 }
 motionButton.addEventListener('click', () => {
  preference = preference === 'full' ? 'reduced' : 'full'; updateMotion();
  try { localStorage.setItem('thmmy-planner-motion', preference); }
  catch { motionButton.title = 'Η επιλογή ισχύει για αυτή την επίσκεψη· η τοπική αποθήκευση δεν είναι διαθέσιμη.'; }
 });
 reduced.addEventListener('change', updateMotion);
 document.addEventListener('visibilitychange', updateMotion);
 function play(element: Element, frames: Keyframe[], duration = 450, delay = 0): void {
  if (!canMove()) return;
  const animation = element.animate(frames, { duration, delay, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
  animations.add(animation);
  void animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
 }
 function enter(elements: Iterable<Element>, stagger = 28): void {
  Array.from(elements).slice(0, 24).forEach((element, index) => play(element, [{ opacity: 0, translate: '0 14px' }, { opacity: 1, translate: '0 0' }], 500, Math.min(index * stagger, 300)));
 }
 updateMotion();
 enter(document.querySelectorAll('.masthead,.intro-copy,.hero-art,.sync-box,.workspace-bar,.sidebar,.schedule-panel'), 75);
 enter(document.querySelectorAll('.hero-line,.intro h1 em,.hero-tools'), 130);
 const calendar = get('calendar');
 const list = get('courseList');
 let previousMeetings = new Map<string, DOMRect>();
 const rememberMeetings = (): void => {
  previousMeetings = new Map(Array.from(calendar.querySelectorAll<HTMLElement>('.meeting'), meeting => [meeting.getAttribute('aria-label')!, meeting.getBoundingClientRect()]));
 };
 document.addEventListener('click', rememberMeetings, {capture: true});
 document.addEventListener('change', rememberMeetings, {capture: true});
 function updateDial(): void {
  const events = activeEvents(), minutes = Array.from({length: 5}, (_, day) => contactMinutes(events.filter(event => event.day === day)));
  const max = Math.max(60, ...minutes);
  get('dialHours').textContent = get('hoursStat').textContent;
  get('rhythmSummary').textContent = events.length ? `${events.length} ΣΥΝΑΝΤΗΣΕΙΣ` : 'ΔΙΑΛΕΞΕ ΜΑΘΗΜΑΤΑ';
  get('weekRhythm').querySelectorAll<HTMLElement>('i').forEach((bar, day) => bar.style.height = `${minutes[day] / max * 100}%`);
  play(get('dialHours'), [{opacity: .2, transform: 'translateY(8px)'}, {opacity: 1, transform: 'translateY(0)'}], 450);
 }
 updateDial();
 new MutationObserver(() => {
  updateDial();
  calendar.querySelectorAll<HTMLElement>('.meeting').forEach((meeting, index) => {
   const before = previousMeetings.get(meeting.getAttribute('aria-label')!), after = meeting.getBoundingClientRect();
   if (before) play(meeting, [{transform: `translate(${before.left - after.left}px,${before.top - after.top}px)`}, {transform: 'translate(0,0)'}], 550);
   else play(meeting, [{opacity: 0, transform: 'translateY(16px)'}, {opacity: 1, transform: 'translateY(0)'}], 550, Math.min(index * 35, 250));
  });
  previousMeetings.clear();
  if (!get('emptyState').hidden) enter([get('emptyState')]);
 }).observe(calendar, { childList: true });
 new MutationObserver(() => enter(list.children, 18)).observe(list, { childList: true });
 for (const id of ['countStat', 'hoursStat', 'conflictStat', 'creditsStat']) {
  const stat = get(id);
  new MutationObserver(() => play(stat, [{ opacity: .35, transform: 'translateY(7px)' }, { opacity: 1, transform: 'translateY(0)' }], 350)).observe(stat, { childList: true });
 }
 const seasonSwitch = document.querySelector<HTMLElement>('.season-switch')!;
 const updateSeason = (): void => {
  seasonSwitch.dataset.active = seasonSwitch.querySelector<HTMLElement>('[aria-pressed="true"]')?.dataset.season;
 };
 new MutationObserver(updateSeason).observe(seasonSwitch, { attributes: true, attributeFilter: ['aria-pressed'], subtree: true });
 updateSeason();
 function burst(x: number, y: number): void {
  if (!canMove()) return;
  for (let i = 0; i < 10; i++) {
   const spark = document.createElement('i'); spark.className = 'spark';
   spark.style.left = `${x}px`; spark.style.top = `${y}px`; spark.style.setProperty('--spark', String(i % 3));
   effects.append(spark);
   const angle = i * Math.PI / 5, distance = 24 + Math.random() * 28;
   play(spark, [{ opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }, { opacity: 0, transform: `translate(${Math.cos(angle) * distance}px,${Math.sin(angle) * distance + 18}px) rotate(${i * 57}deg) scale(.25)` }], 700);
   setTimeout(() => spark.remove(), 750);
  }
 }
 document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
  if (!target || !canMove()) return;
  const rect = target.getBoundingClientRect();
  if (target.dataset.toggle && target.getAttribute('aria-pressed') === 'false') burst(rect.left + rect.width / 2, rect.top + rect.height / 2);
  play(target, [{ translate: '0 0' }, { translate: '0 2px' }, { translate: '0 0' }], 220);
  if (target.matches('.primary,#printButton,#profileButton')) {
   const ripple = document.createElement('i'); ripple.className = 'click-ring';
   ripple.style.left = `${rect.left + rect.width / 2}px`; ripple.style.top = `${rect.top + rect.height / 2}px`;
   effects.append(ripple); play(ripple, [{ opacity: .7, transform: 'translate(-50%,-50%) scale(.2)' }, { opacity: 0, transform: 'translate(-50%,-50%) scale(2.5)' }], 600);
   setTimeout(() => ripple.remove(), 650);
  }
 }, { capture: true });
 document.addEventListener('change', event => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.dataset.passed || !input.checked) return;
  const rect = input.getBoundingClientRect(); burst(rect.left + rect.width / 2, rect.top + rect.height / 2);
 }, { capture: true });
 let glowFrame = 0;
 for (const panel of document.querySelectorAll<HTMLElement>('.schedule-panel,.sidebar')) {
  panel.addEventListener('pointermove', event => {
   if (!canMove() || event.pointerType !== 'mouse' || glowFrame) return;
   glowFrame = requestAnimationFrame(() => {
    const rect = panel.getBoundingClientRect();
    panel.style.setProperty('--glow-x', `${event.clientX - rect.left}px`);
    panel.style.setProperty('--glow-y', `${event.clientY - rect.top}px`); glowFrame = 0;
   });
  });
 }
 const hero = document.querySelector<HTMLElement>('.intro')!;
 const orbit = document.querySelector<HTMLElement>('.orbit-field')!;
 let orbitFrame = 0;
 hero.addEventListener('pointermove', event => {
  if (!canMove() || event.pointerType !== 'mouse' || orbitFrame) return;
  orbitFrame = requestAnimationFrame(() => {
   const rect = hero.getBoundingClientRect(), x = (event.clientX - rect.left) / rect.width - .5, y = (event.clientY - rect.top) / rect.height - .5;
   orbit.style.setProperty('--orbit-x', `${x * 24}px`); orbit.style.setProperty('--orbit-y', `${y * 20}px`);
   orbit.style.setProperty('--orbit-tilt', `${x * 12}deg`); orbitFrame = 0;
  });
 });
 hero.addEventListener('pointerleave', () => { for (const property of ['--orbit-x','--orbit-y','--orbit-tilt']) orbit.style.removeProperty(property); });
 const topButton = get<HTMLButtonElement>('backToTop');
 let scrollFrame = 0;
 const updateScroll = (): void => {
  const max = root.scrollHeight - innerHeight;
  get('readingProgress').style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
  topButton.hidden = scrollY < 450;
 };
 window.addEventListener('scroll', () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(() => { updateScroll(); scrollFrame = 0; }); }, { passive: true });
 topButton.addEventListener('click', () => window.scrollTo({ top: 0, behavior: canMove() ? 'smooth' : 'instant' }));
 updateScroll();

 const palette = get<HTMLDialogElement>('commandDialog');
 const search = get<HTMLInputElement>('commandSearch');
 const results = get<HTMLDivElement>('commandResults');
 const commands: Command[] = [
  { label: 'Αναζήτηση μαθημάτων', hint: '/', run: () => { get<HTMLInputElement>('search').focus(); get('search').scrollIntoView({ block: 'center' }); } },
  { label: 'Το προφίλ σπουδών μου', hint: 'Προφίλ', run: () => get('profileButton').click() },
  { label: 'Μεταφορά δεδομένων', hint: 'Εισαγωγή / εξαγωγή', run: () => get('transferButton').click() },
  { label: 'Ανανέωση από ΤΗΜΜΥ', hint: 'Πηγές', run: () => get('refresh').click() },
  { label: 'Αποθήκευση αντιγράφου HTML', hint: 'Αντίγραφο', run: () => get('saveCopy').click() },
  { label: 'Εκτύπωση / PDF', hint: 'PDF', run: () => get('printButton').click() },
  { label: 'Μεγέθυνση / επαναφορά προγράμματος', hint: 'Προβολή', run: () => get('focusSchedule').click() },
  { label: 'Αλλαγή φωτεινού / σκοτεινού θέματος', hint: 'Εμφάνιση', run: () => { const theme = get<HTMLSelectElement>('theme'); theme.value = root.dataset.theme === 'dark' ? 'light' : 'dark'; theme.dispatchEvent(new Event('change')); } }
 ];
 const normalize = (text: string): string => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('el');
 let matches: Command[] = [], activeCommand = 0;
 function renderCommands(): void {
  matches = commands.filter(command => normalize(command.label).includes(normalize(search.value)));
  activeCommand = Math.min(activeCommand, Math.max(0, matches.length - 1));
  results.replaceChildren();
  matches.forEach((command, index) => {
   const button = document.createElement('button'); button.type = 'button'; button.className = 'command-result';
   button.id = `command-${index}`; button.setAttribute('role', 'option'); button.setAttribute('aria-selected', String(index === activeCommand));
   const label = document.createElement('span'), hint = document.createElement('small'); label.textContent = command.label; hint.textContent = command.hint;
   button.append(label, hint); button.addEventListener('click', () => { palette.close(); command.run(); }); results.append(button);
  });
  if (!matches.length) { const message = document.createElement('p'); message.className = 'subtle'; message.textContent = 'Δεν βρέθηκε εντολή.'; results.append(message); search.removeAttribute('aria-activedescendant'); }
  else search.setAttribute('aria-activedescendant', `command-${activeCommand}`);
 }
 function openPalette(): void { search.value = ''; activeCommand = 0; renderCommands(); palette.showModal(); search.focus(); }
 get('commandButton').addEventListener('click', openPalette);
 search.addEventListener('input', () => { activeCommand = 0; renderCommands(); });
 search.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); palette.close(); return; }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); activeCommand = Math.max(0, Math.min(matches.length - 1, activeCommand + (event.key === 'ArrowDown' ? 1 : -1))); renderCommands(); }
  if (event.key === 'Enter' && matches[activeCommand]) { event.preventDefault(); palette.close(); matches[activeCommand].run(); }
 });
 document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); if (!document.querySelector('dialog[open]')) openPalette(); return; }
  const editing = event.target instanceof Element && !!event.target.closest('input,textarea,select,[contenteditable="true"]');
  if (event.key === '/' && !editing && !document.querySelector('dialog[open]')) { event.preventDefault(); get<HTMLInputElement>('search').focus(); get('search').scrollIntoView({ block: 'center' }); }
 });

 window.addEventListener('beforeprint', () => { printing = true; updateMotion(); visualStyle.media = 'not all'; fitCalendar(); });
 window.addEventListener('afterprint', () => { visualStyle.media = 'screen'; printing = false; updateMotion(); fitCalendar(); });
})();
