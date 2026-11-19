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
  dr: 'Datenort', str: 'Strukturgrad', law: 'Recht und Regelwerke', std: 'Standards und Verfahren'
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

// Kurzformen gelten nur für die schmalen Filterpillen.
const shortLabels = {
  dr: {
    person: 'Eigene Unterlagen', praxis: 'Praxis', partner: 'Weitere Einrichtung',
    epa: 'ePA', kv: 'KV', kasse: 'Krankenkasse', pkv: 'PKV',
    ohne: 'Ohne Ablage', offen: 'Ungeklärt'
  },
  law: {
    'Psychotherapie-Richtlinie': 'PT-Richtlinie',
    'Psychotherapie-Vereinbarung': 'PT-Vereinbarung'
  },
  std: {'Bundeseinheitlicher Medikationsplan': 'BMP'}
};
const primaryFacets = ['dr', 'str', 'law', 'std'];
const secondaryFacets = ['bereich', 'art', 'setting'];

function facetRow(group) {
  const row = document.createElement('div');
  row.id = 'facet-' + group;
  row.className = 'facet-row';
  row.setAttribute('role', 'group');

  const heading = document.createElement('span');
  heading.id = row.id + '-label';
  heading.className = 'filter-label';
  heading.textContent = facetLabels[group];
  row.setAttribute('aria-labelledby', heading.id);

  const options = document.createElement('div');
  options.className = 'facet-options';
  for (const value of available[group]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'facet-pill';
    button.value = value;
    const fullName = facetName(group, value);
    const label = shortLabels[group]?.[value] || fullName;
    button.textContent = label;
    if (label !== fullName) {
      button.setAttribute('aria-label', fullName.includes(label) ? fullName : label + ', ' + fullName);
    }
    button.addEventListener('click', () => {
      if (selected[group].has(value)) selected[group].delete(value);
      else selected[group].add(value);
      updateCards();
    });
    options.append(button);
  }
  row.append(heading, options);
  return row;
}

function installFacets() {
  byId('facet-controls').append(...primaryFacets.map(facetRow));
  byId('facet-secondary').append(...secondaryFacets.map(facetRow));
  byId('reset-extra').addEventListener('click', () => {
    clearDimensions();
    updateCards();
    byId('facet-controls').querySelector('button').focus();
  });
}

function clearDimensions() {
  Object.values(selected).forEach(values => values.clear());
}

// Counts refer to distinct steps. Other filters still apply to each candidate option.
function updateFacets() {
  const candidates = PROZESSE.filter(step => (phase === 'alle' || step.zeiten.includes(phase)) && matchesSearch(step));
  for (const [group, choices] of Object.entries(selected)) {
    for (const button of byId('facet-' + group).querySelectorAll('button')) {
      const value = button.value;
      const count = candidates.filter(step => matchesDimensions(step, group, value)).length;
      const description = count === 1 ? '1 passender Schritt' : count + ' passende Schritte';
      button.setAttribute('aria-pressed', String(choices.has(value)));
      button.setAttribute('aria-description', description);
      button.title = facetName(group, value) + ' · ' + description;
    }
  }
  const secondaryCount = secondaryFacets.reduce((sum, group) => sum + selected[group].size, 0);
  byId('more-count').textContent = secondaryCount ? '(' + secondaryCount + ' aktiv)' : '';
  byId('more-count').hidden = secondaryCount === 0;
  byId('reset-extra').hidden = !Object.values(selected).some(choices => choices.size);
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
  byId('more-filters').open = secondaryFacets.some(group => selected[group].size > 0);
  const startPhase = entry.get('phase');
  if (Object.hasOwn(phases, startPhase)) phase = startPhase;
  byId('phase-row').querySelectorAll('button').forEach(button => setPressed(button, button.dataset.phase === phase));
  changeView(entry.get('ansicht') === 'matrix');
}
