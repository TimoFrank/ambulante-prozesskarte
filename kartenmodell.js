// Gemeinsames Fachmodell für die Kartenansichten. Die Zuordnung gilt je Objektvariante.
'use strict';

const phases = {vor: 'Vor dem Kontakt', im: 'Während des Kontakts', nach: 'Im weiteren Verlauf', uebergreifend: 'Kontaktübergreifend'};
const rooms = {
  person: 'Unterlagen der Person',
  praxis: 'Behandelnde Praxis',
  partner: 'Weitere Versorgungseinrichtung',
  epa: 'Elektronische Patientenakte (ePA)',
  dienst: 'Fachdienst',
  kv: 'Kassenärztliche Vereinigung',
  kasse: 'Gesetzliche Krankenkasse',
  pkv: 'Privater Krankenversicherer',
  datenstelle: 'Datenstelle',
  ohne: 'Ohne personenbezogene Ablage',
  offen: 'Ablage ungeklärt'
};
const facetLabels = {
  setting: 'Fachpfad', bereich: 'Prozessbereich', art: 'Informationsdomäne',
  dr: 'Datenort', str: 'Strukturgrad', law: 'Recht und Regelwerk', std: 'Standard und Verfahren'
};
const uniqueValues = values => [...new Set(values)].sort((a, b) => a.localeCompare(b, 'de'));

function standardGroup(label) {
  if (/FHIR/i.test(label)) return 'FHIR';
  if (/\b(?:ICD|OPS|LOINC|SNOMED|ATC)\b/i.test(label)) return 'Terminologien';
  if (/\b(?:Muster|Vordruck|eFormular|Formular|PTV)\b/i.test(label)) return 'Formulare';
  if (/^(?:KIM|TI|VSDM|eEB|eAU|E-Rezept)/i.test(label)) return 'TI-Verfahren';
  if (/^(?:LDT|BDT|GDT|KVDT|ADT|xDT)/i.test(label)) return 'xDT';
  return label;
}

const available = {
  setting: uniqueValues(PROZESSE.flatMap(s => s.setting)),
  bereich: uniqueValues(PROZESSE.map(s => s.bereich)),
  art: uniqueValues(PROZESSE.flatMap(s => s.objekte.map(o => o.art))),
  dr: Object.keys(rooms).filter(key => PROZESSE.some(s => s.objekte.some(o => o.ort.includes(key)))),
  str: ['strukturiert', 'teilstrukturiert', 'unstrukturiert', 'ungeklärt'].filter(value => PROZESSE.some(s => s.objekte.some(o => o.struktur === value))),
  law: uniqueValues(PROZESSE.flatMap(s => s.gesetze)),
  std: uniqueValues(PROZESSE.flatMap(s => s.standards.map(standardGroup)))
};
const selected = Object.fromEntries(Object.keys(available).map(group => [group, new Set()]));
const facetName = (group, key) => group === 'dr' ? rooms[key] : key;
const locationsOf = step => [...new Set(step.objekte.flatMap(object => object.ort))];
const namesOf = step => [...new Set(step.objekte.map(object => object.name))];

function matchesFacet(group, values, candidateGroup, candidate) {
  if (candidateGroup === group) return values.includes(candidate);
  return selected[group].size === 0 || values.some(value => selected[group].has(value));
}

function matchesObject(object, group, value) {
  return matchesFacet('art', [object.art], group, value)
    && matchesFacet('str', [object.struktur], group, value)
    && matchesFacet('dr', object.ort, group, value);
}

function matchesDimensions(step, group, value) {
  return matchesFacet('setting', step.setting, group, value)
    && matchesFacet('bereich', [step.bereich], group, value)
    && matchesFacet('law', step.gesetze, group, value)
    && matchesFacet('std', step.standards.map(standardGroup), group, value)
    && step.objekte.some(object => matchesObject(object, group, value));
}

function visibleSteps() {
  return PROZESSE.filter(step => (phase === 'alle' || step.zeiten.includes(phase)) && matchesSearch(step) && matchesDimensions(step));
}

function resultSections(steps) {
  if (phase !== 'alle') return [[phase, phases[phase], steps]];
  return Object.entries(phases).map(([key, label]) => [key, label, steps.filter(step => step.phase === key)]);
}

function objectDetails(step, search) {
  return '<section class="object-details"><h3>Informationen und Datenorte</h3><ul>'
    + step.objekte.map(item => '<li><strong>' + mark(item.name, search) + '</strong>'
      + '<span class="object-facts">' + [item.art, item.struktur, item.ort.map(key => rooms[key]).join(', ')].map(value => mark(value, search)).join(' · ') + '</span>'
      + '<span>' + mark(item.variante, search) + '</span></li>').join('')
    + '</ul></section>';
}

function installFacets() {
  const container = byId('facet-controls');
  for (const [group, values] of Object.entries(available)) {
    const menu = document.createElement('details');
    menu.id = 'facet-' + group;
    menu.className = 'facet';
    const summary = document.createElement('summary');
    summary.innerHTML = escapeText(facetLabels[group]) + '<span class="facet-value"></span>';
    const panel = document.createElement('div');
    panel.className = 'facet-options';
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', facetLabels[group]);
    for (const value of values) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = value;
      input.addEventListener('change', () => {
        if (input.checked) selected[group].add(value);
        else selected[group].delete(value);
        updateCards();
      });
      const caption = document.createElement('span');
      caption.textContent = facetName(group, value);
      const count = document.createElement('span');
      count.className = 'facet-count';
      label.append(input, caption, count);
      panel.append(label);
    }
    menu.append(summary, panel);
    container.append(menu);
    menu.addEventListener('toggle', () => {
      if (!menu.open) return;
      container.querySelectorAll('details[open]').forEach(other => { if (other !== menu) other.open = false; });
      menu.classList.toggle('align-end', menu.getBoundingClientRect().left + panel.offsetWidth > window.innerWidth - 12);
    });
  }
  document.addEventListener('click', e => container.querySelectorAll('details[open]').forEach(menu => {
    if (!menu.contains(e.target)) menu.open = false;
  }));
  container.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const menu = e.target.closest('details[open]');
    if (menu) { menu.open = false; menu.querySelector('summary').focus(); }
  });
  byId('reset-extra').addEventListener('click', () => {
    clearDimensions();
    updateCards();
  });
}

function clearDimensions() {
  Object.values(selected).forEach(values => values.clear());
}

// Counts refer to distinct steps. Other filters still apply to each candidate option.
function updateFacets() {
  const candidates = PROZESSE.filter(step => (phase === 'alle' || step.zeiten.includes(phase)) && matchesSearch(step));
  let hasSelection = false;
  for (const [group, choices] of Object.entries(selected)) {
    const menu = byId('facet-' + group);
    const names = [...choices].map(value => facetName(group, value));
    menu.classList.toggle('applied', Boolean(names.length));
    menu.querySelector('.facet-value').textContent = names.length ? names.join(', ') : '';
    if (names.length) hasSelection = true;
    for (const input of menu.querySelectorAll('input')) {
      input.checked = choices.has(input.value);
      input.parentElement.querySelector('.facet-count').textContent = candidates.filter(step => matchesDimensions(step, group, input.value)).length;
    }
  }
  byId('reset-extra').hidden = !hasSelection;
}

function matrixTable(printing = false) {
  const included = visibleSteps();
  const columns = available.dr.filter(key => !selected.dr.size || selected.dr.has(key));
  const heading = columns.map(key => '<th scope="col">' + escapeText(rooms[key]) + '</th>').join('');
  const rows = available.art.map(domain => {
    const steps = included.filter(step => step.objekte.some(o => o.art === domain && matchesObject(o)));
    if (!steps.length) return '';
    const cells = columns.map(key => {
      const items = steps.filter(step => step.objekte.some(o => o.art === domain && o.ort.includes(key) && matchesObject(o))).map(step => {
        const name = escapeText(stepNumber(step) + ' ' + step.titel);
        if (printing) return '<p>' + name + '</p>';
        return '<button class="matrix-step-chip phase-' + step.phase + '" data-nr="' + step.nr + '" aria-haspopup="dialog" title="' + name + '" aria-label="' + name + '">' + stepNumber(step) + '</button>';
      });
      return '<td>' + items.join('') + '</td>';
    }).join('');
    return '<tr><th scope="row" class="matrix-domaene">' + escapeText(domain) + '</th>' + cells + '</tr>';
  }).join('');
  return '<table class="' + (printing ? 'print-table matrix-print' : 'matrix-table') + '" aria-label="Informationsdomänen und Datenorte"><thead><tr><th scope="col">Informationsdomäne</th>' + heading + '</tr></thead><tbody>' + rows + '</tbody></table>';
}

function updateMatrix() {
  if (currentView !== 'matrix') return;
  byId('matrix-view').innerHTML = '<h2 class="matrix-title">Informationsdomänen und Datenorte</h2>'
    + '<p class="matrix-help">' + visibleSteps().length + ' von ' + PROZESSE.length + ' Schritten. Die Nummer öffnet den zugehörigen Prozessschritt.</p>'
    + '<div class="matrix-wrap" tabindex="0" role="region" aria-label="Matrix, bei Bedarf seitlich scrollen">' + matrixTable() + '</div>';
}

function filterDescription() {
  const parts = [phase === 'alle' ? 'Alle Phasen' : phases[phase]];
  for (const [group, values] of Object.entries(selected)) {
    if (values.size) parts.push(facetLabels[group] + ' (' + [...values].map(value => facetName(group, value)).join(', ') + ')');
  }
  if (query) parts.push('Suche „' + query + '“');
  return parts.join(', ');
}

function readEntry() {
  const entry = new URLSearchParams(location.search);
  query = (entry.get('suche') || '').trim();
  byId('search-input').value = query;
  for (const [group, name] of Object.entries({setting:'fachpfad', bereich:'bereich', art:'informationsdomaene', dr:'datenort', str:'strukturgrad', law:'recht', std:'standard'})) {
    for (const value of entry.getAll(name)) {
      const key = available[group].find(key => key.toLocaleLowerCase('de') === value.toLocaleLowerCase('de'));
      if (key) selected[group].add(key);
    }
  }
  const startPhase = entry.get('phase');
  if (Object.hasOwn(phases, startPhase)) phase = startPhase;
  byId('phase-row').querySelectorAll('button').forEach(button => setPressed(button, button.dataset.phase === phase));
  changeView(entry.get('ansicht') === 'matrix');
}
