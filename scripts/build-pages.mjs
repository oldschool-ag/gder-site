import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const entitiesSource = fs.readFileSync(path.join(root, 'entities.js'), 'utf8');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(entitiesSource, context);

const baseEntities = Array.isArray(context.window.GDER_ENTITIES) ? context.window.GDER_ENTITIES : [];
const normalizedPathCandidates = [
  process.env.GDER_NORMALIZED_PATH,
  path.resolve(root, '..', 'scr-registry', 'data/dao-candidates/dao-candidates-v0.normalized.json'),
  '/home/node/.openclaw/repos/scr-registry/data/dao-candidates/dao-candidates-v0.normalized.json'
].filter(Boolean);
const normalizedPath = normalizedPathCandidates.find((candidate) => fs.existsSync(candidate));
const normalizedRecords = normalizedPath
  ? JSON.parse(fs.readFileSync(normalizedPath, 'utf8'))
  : [];

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function hasValue(value) {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasValue);
  if (typeof value === 'object') return Object.values(value).some(hasValue);
  return true;
}

function safe(value, fallback = '—') {
  return hasValue(value) ? value : fallback;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function titleCaseFromKey(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatScalar(value) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function renderLink(url) {
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>`;
}

function renderList(items, type = 'text') {
  const values = Array.isArray(items) ? items.filter(hasValue) : [];
  if (!values.length) return '';

  const renderedItems = values
    .map((item) => {
      if (type === 'url') {
        return `<li>${renderLink(item)}</li>`;
      }
      return `<li>${escapeHtml(formatScalar(item))}</li>`;
    })
    .join('');

  return `<ul class="entity-links">${renderedItems}</ul>`;
}

function renderField(label, value) {
  if (!hasValue(value)) return '';
  return `
    <dl class="entity-field">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(formatScalar(value))}</dd>
    </dl>
  `;
}

function renderAnchorSection(title, anchor) {
  if (!hasValue(anchor)) return '';

  const fields = [
    renderField('Anchor type', hasValue(anchor.anchor_type) ? titleCaseFromKey(anchor.anchor_type) : null),
    renderField('Label', anchor.label),
    renderField('Summary', anchor.summary),
  ]
    .filter(Boolean)
    .join('');

  const urlBlock = hasValue(anchor.url)
    ? `<p class="entity-anchor-link">${renderLink(anchor.url)}</p>`
    : '';

  return `
    <section class="entity-section">
      <h3>${escapeHtml(title)}</h3>
      <div class="entity-grid">${fields}</div>
      ${urlBlock}
    </section>
  `;
}

function renderConfidence(confidence) {
  if (!hasValue(confidence)) return '';

  return `
    <section class="entity-section">
      <h3>Confidence</h3>
      <div class="entity-grid">
        ${renderField('Tier', hasValue(confidence.tier) ? titleCaseFromKey(confidence.tier) : null)}
        ${renderField('Score', confidence.score)}
        ${renderField('Rationale', confidence.rationale)}
      </div>
    </section>
  `;
}

function renderReferenceCard(reference) {
  if (!hasValue(reference)) return '';

  const fields = [
    renderField('Label', reference.label),
    renderField('Network', reference.network),
    renderField('Address', reference.address),
    renderField(
      'Treasury control',
      hasValue(reference.custody_type) ? titleCaseFromKey(reference.custody_type) : null
    ),
    renderField('Threshold', reference.threshold),
  ]
    .filter(Boolean)
    .join('');

  const controllerBlock = Array.isArray(reference.controlling_addresses) && reference.controlling_addresses.length
    ? `
      <div class="entity-subsection">
        <p class="entity-subtitle">Controlling addresses</p>
        <div class="entity-reference-list">
          ${reference.controlling_addresses
            .map((addressRef) => {
              const addressFields = [
                renderField('Label', addressRef.label),
                renderField('Network', addressRef.network),
                renderField('Address', addressRef.address),
              ]
                .filter(Boolean)
                .join('');
              const addressLink = hasValue(addressRef.url)
                ? `<div class="entity-reference-links"><a class="button button-secondary button-compact" href="${escapeHtml(addressRef.url)}" target="_blank" rel="noreferrer">Open link</a></div>`
                : '';
              return `
                <article class="entity-reference-card entity-reference-card-nested">
                  <div class="entity-grid">${addressFields}</div>
                  ${addressLink}
                </article>
              `;
            })
            .join('')}
        </div>
      </div>
    `
    : '';

  const noteBlock = Array.isArray(reference.notes) && reference.notes.length
    ? reference.notes.map((note) => `<p class="entity-note">${escapeHtml(note)}</p>`).join('')
    : '';

  const links = [];
  if (hasValue(reference.url)) {
    links.push(
      `<a class="button button-secondary button-compact" href="${escapeHtml(reference.url)}" target="_blank" rel="noreferrer">Open link</a>`
    );
  }
  if (hasValue(reference.source_url) && reference.source_url !== reference.url) {
    links.push(
      `<a class="button button-secondary button-compact" href="${escapeHtml(reference.source_url)}" target="_blank" rel="noreferrer">${escapeHtml(reference.source_label || 'Source')}</a>`
    );
  } else if (hasValue(reference.source_url) && reference.source_url === reference.url && hasValue(reference.source_label)) {
    links.splice(
      0,
      links.length,
      `<a class="button button-secondary button-compact" href="${escapeHtml(reference.url)}" target="_blank" rel="noreferrer">${escapeHtml(reference.source_label)}</a>`
    );
  }

  return `
    <article class="entity-reference-card">
      <div class="entity-grid">${fields}</div>
      ${controllerBlock}
      ${noteBlock}
      ${links.length ? `<div class="entity-reference-links">${links.join('')}</div>` : ''}
    </article>
  `;
}

function renderOnchainReferences(onchainReferences) {
  if (!hasValue(onchainReferences)) return '';

  const tokenRefs = Array.isArray(onchainReferences.token_refs)
    ? onchainReferences.token_refs.filter(hasValue)
    : [];
  const treasuryRefs = Array.isArray(onchainReferences.treasury_refs)
    ? onchainReferences.treasury_refs.filter(hasValue)
    : [];
  const notes = Array.isArray(onchainReferences.notes) ? onchainReferences.notes.filter(hasValue) : [];

  const tokenSection = tokenRefs.length
    ? `
      <div class="entity-subsection">
        <p class="entity-subtitle">Token references</p>
        <div class="entity-reference-list">${tokenRefs.map(renderReferenceCard).join('')}</div>
      </div>
    `
    : '';

  const treasurySection = treasuryRefs.length
    ? `
      <div class="entity-subsection">
        <p class="entity-subtitle">Treasury references</p>
        <div class="entity-reference-list">${treasuryRefs.map(renderReferenceCard).join('')}</div>
      </div>
    `
    : '';

  const notesSection = notes.length
    ? `
      <div class="entity-subsection">
        <p class="entity-subtitle">Notes</p>
        ${notes.map((note) => `<p class="entity-note">${escapeHtml(note)}</p>`).join('')}
      </div>
    `
    : '';

  if (!tokenSection && !treasurySection && !notesSection) return '';

  return `
    <section class="entity-section">
      <h3>Onchain references</h3>
      <p class="entity-note">These links are convenience references for public inspection. Treasury control notes are shown only where the public evidence was strong enough to support the claim.</p>
      ${tokenSection}
      ${treasurySection}
      ${notesSection}
    </section>
  `;
}

function renderGenericValue(value) {
  if (!hasValue(value)) return '';

  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === 'string')) {
      const maybeUrls = value.every((item) => /^https?:\/\//.test(item));
      return renderList(value, maybeUrls ? 'url' : 'text');
    }

    return value
      .map((item) => renderGenericValue(item))
      .filter(Boolean)
      .join('');
  }

  if (typeof value === 'object') {
    const fields = Object.entries(value)
      .map(([key, nestedValue]) => renderField(titleCaseFromKey(key), nestedValue))
      .filter(Boolean)
      .join('');

    return fields ? `<div class="entity-grid">${fields}</div>` : '';
  }

  if (typeof value === 'string' && /^https?:\/\//.test(value)) {
    return `<p class="entity-anchor-link">${renderLink(value)}</p>`;
  }

  return `<p class="entity-note">${escapeHtml(formatScalar(value))}</p>`;
}

function writePage(dirName, content) {
  const dirPath = path.join(root, dirName);
  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(path.join(dirPath, 'index.html'), content);
}

function layout({ title, description, canonicalPath, bodyClass = '', main }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#12151d" />
    <meta name="robots" content="index,follow" />
    <meta name="description" content="${escapeHtml(description)}" />
    <title>${escapeHtml(title)}</title>
    <link rel="canonical" href="https://gder.net${escapeHtml(canonicalPath)}" />
    <link rel="icon" href="/assets/favicon.ico" sizes="any" />
    <link rel="icon" type="image/svg+xml" href="/assets/gder-mark.svg" />
    <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />
    <link rel="manifest" href="/site.webmanifest" />
    <link rel="stylesheet" href="/styles.css" />
    <script src="/entities.js" defer></script>
    <script src="/script.js" defer></script>
  </head>
  <body class="${escapeHtml(bodyClass)}">
    <div class="site-shell">
      <header class="site-header">
        <a class="brand-lockup" href="/" aria-label="GDER home">
          <img src="/assets/gder-lockup.svg" alt="GDER by Old School" width="720" height="220" />
        </a>

        <nav class="site-nav" aria-label="Primary">
          <a href="/">Home</a>
          <a href="/full-list/">Show all entities</a>
          <a class="button button-primary button-compact" href="/newlisting/">Request listing</a>
        </nav>
      </header>

      <main>
        ${main}
      </main>

      <footer class="site-footer">
        <div class="footer-brand">
          <p class="footer-product">GDER · Governed Digital Entity Register</p>
          <p class="footer-note">An Old School product.</p>
          <p class="footer-disclaimer">GDER is a governed, publicly inspectable register. It is not presented as a sovereign-registry replacement.</p>
        </div>

        <div class="footer-links-grid">
          <div>
            <p class="footer-heading">Legal</p>
            <a href="/terms/">Terms</a>
            <a href="/privacy/">Privacy</a>
            <a href="/data-security/">Data security</a>
            <a href="/disclaimers/">Disclaimers</a>
          </div>
          <div>
            <p class="footer-heading">Projects</p>
            <a href="https://oldschool.ag/" target="_blank" rel="noreferrer">Old School</a>
            <a href="https://faivr.ai/" target="_blank" rel="noreferrer">FAIVR</a>
          </div>
          <div>
            <p class="footer-heading">Contact</p>
            <a href="mailto:hello@gder.net">hello@gder.net</a>
            <span>Old School GmbH</span>
            <span>Zugerstrasse 88 · 6318 Walchwil · Switzerland</span>
          </div>
        </div>
      </footer>
    </div>
  </body>
</html>`;
}

const normalizedById = new Map(normalizedRecords.map((record) => [record.entity_id, record]));
const normalizedBySlug = new Map(
  normalizedRecords.flatMap((record) => {
    const values = [record.display_name, record.canonical_name, record.legal_name]
      .filter(hasValue)
      .map((item) => [slugify(item), record]);
    return values;
  })
);

function mergeEntity(baseEntity) {
  const slug = slugify(baseEntity.name);
  const normalized =
    normalizedById.get(baseEntity.id) ||
    normalizedBySlug.get(slug) ||
    normalizedBySlug.get(slugify(baseEntity.legalName)) ||
    null;

  const extra = normalized
    ? Object.fromEntries(
        Object.entries(normalized).filter(([key, value]) => {
          const handled = new Set([
            'entity_id',
            'canonical_name',
            'legal_name',
            'display_name',
            'aliases',
            'entity_type',
            'jurisdiction',
            'registry_type',
            'registry_id',
            'legal_wrapper_type',
            'status',
            'formation_date',
            'formation_country',
            'parent_entity',
            'dao_candidate_flag',
            'dao_candidate_basis',
            'admission_signals',
            'governance_anchor',
            'treasury_anchor',
            'onchain_references',
            'canonical_url',
            'source_urls',
            'official_source_urls',
            'secondary_source_urls',
            'confidence',
            'notes',
          ]);
          return !handled.has(key) && hasValue(value);
        })
      )
    : {};

  return {
    slug,
    entityId: normalized?.entity_id || baseEntity.id,
    canonicalName: normalized?.canonical_name || baseEntity.name,
    displayName: normalized?.display_name || baseEntity.name,
    legalName: normalized?.legal_name || baseEntity.legalName || null,
    aliases: normalized?.aliases || [],
    entityType: normalized?.entity_type || baseEntity.entityType || null,
    jurisdiction: normalized?.jurisdiction || baseEntity.jurisdiction || null,
    registryType: normalized?.registry_type || null,
    registryId: normalized?.registry_id || null,
    legalWrapperType: normalized?.legal_wrapper_type || baseEntity.legalWrapperType || null,
    status: normalized?.status || baseEntity.status || null,
    formationDate: normalized?.formation_date || null,
    formationCountry: normalized?.formation_country || baseEntity.formationCountry || null,
    parentEntity: normalized?.parent_entity || null,
    daoCandidateFlag: normalized?.dao_candidate_flag,
    basis: normalized?.dao_candidate_basis || baseEntity.basis || null,
    admissionSignals: normalized?.admission_signals || [],
    governanceAnchor:
      normalized?.governance_anchor ||
      (baseEntity.governanceAnchorType
        ? {
            anchor_type: baseEntity.governanceAnchorType,
            url: baseEntity.canonicalUrl || null,
            label: null,
            summary: null,
          }
        : null),
    treasuryAnchor: normalized?.treasury_anchor || null,
    onchainReferences: normalized?.onchain_references || null,
    canonicalUrl: normalized?.canonical_url || baseEntity.canonicalUrl || null,
    sourceUrls: normalized?.source_urls || (baseEntity.canonicalUrl ? [baseEntity.canonicalUrl] : []),
    officialSourceUrls: normalized?.official_source_urls || [],
    secondarySourceUrls: normalized?.secondary_source_urls || [],
    confidence:
      normalized?.confidence || {
        score: null,
        tier: baseEntity.confidenceTier || null,
        rationale: null,
      },
    notes: normalized?.notes || null,
    extra,
  };
}

const mergedEntities = baseEntities.map(mergeEntity);

function entityPage(entity) {
  const overviewFields = [
    renderField('Entity ID', entity.entityId),
    renderField('Display name', entity.displayName),
    renderField('Canonical name', entity.canonicalName),
    renderField('Legal name', entity.legalName),
    renderField('Entity type', hasValue(entity.entityType) ? titleCaseFromKey(entity.entityType) : null),
    renderField('Documented wrapper', entity.legalWrapperType),
    renderField('Jurisdiction', entity.jurisdiction),
    renderField('Formation country', entity.formationCountry),
    renderField('Formation date', entity.formationDate),
    renderField('Registry type', hasValue(entity.registryType) ? titleCaseFromKey(entity.registryType) : null),
    renderField('Registry ID', entity.registryId),
    renderField('Status', hasValue(entity.status) ? titleCaseFromKey(entity.status) : null),
    renderField('Parent entity', entity.parentEntity),
    renderField('DAO candidate flag', entity.daoCandidateFlag),
  ]
    .filter(Boolean)
    .join('');

  const primaryTokenReference = Array.isArray(entity.onchainReferences?.token_refs)
    ? entity.onchainReferences.token_refs.find(hasValue) || null
    : null;
  const primaryTreasuryReference = Array.isArray(entity.onchainReferences?.treasury_refs)
    ? entity.onchainReferences.treasury_refs.find(hasValue) || null
    : null;
  const actionButtons = [
    `<a class="button button-primary" href="/newlisting/?mode=edit&entity=${entity.slug}">Edit entry</a>`,
    hasValue(entity.canonicalUrl)
      ? `<a class="button button-secondary" href="${escapeHtml(entity.canonicalUrl)}" target="_blank" rel="noreferrer">Official source</a>`
      : '',
    hasValue(primaryTokenReference?.url)
      ? `<a class="button button-secondary" href="${escapeHtml(primaryTokenReference.url)}" target="_blank" rel="noreferrer">Token</a>`
      : '',
    hasValue(primaryTreasuryReference?.url)
      ? `<a class="button button-secondary" href="${escapeHtml(primaryTreasuryReference.url)}" target="_blank" rel="noreferrer">Treasury</a>`
      : ''
  ]
    .filter(Boolean)
    .join('');

  const aliasesSection = hasValue(entity.aliases)
    ? `
      <section class="entity-section">
        <h3>Aliases</h3>
        ${renderList(entity.aliases, 'text')}
      </section>
    `
    : '';

  const admissionSection = hasValue(entity.admissionSignals)
    ? `
      <section class="entity-section">
        <h3>Admission signals</h3>
        ${renderList(entity.admissionSignals.map(titleCaseFromKey), 'text')}
      </section>
    `
    : '';

  const basisSection = hasValue(entity.basis)
    ? `
      <section class="entity-section">
        <h3>Basis</h3>
        <p class="entity-note">${escapeHtml(entity.basis)}</p>
      </section>
    `
    : '';

  const notesSection = hasValue(entity.notes)
    ? `
      <section class="entity-section">
        <h3>Notes</h3>
        <p class="entity-note">${escapeHtml(entity.notes)}</p>
      </section>
    `
    : '';

  const canonicalUrlSection = hasValue(entity.canonicalUrl)
    ? `
      <section class="entity-section">
        <h3>Canonical URL</h3>
        <p class="entity-anchor-link">${renderLink(entity.canonicalUrl)}</p>
      </section>
    `
    : '';

  const sourceSection = `
    <section class="entity-section">
      <h3>Sources</h3>
      ${hasValue(entity.officialSourceUrls) ? `<div class="entity-subsection"><p class="entity-subtitle">Official sources</p>${renderList(entity.officialSourceUrls, 'url')}</div>` : ''}
      ${hasValue(entity.secondarySourceUrls) ? `<div class="entity-subsection"><p class="entity-subtitle">Secondary sources</p>${renderList(entity.secondarySourceUrls, 'url')}</div>` : ''}
      ${hasValue(entity.sourceUrls) ? `<div class="entity-subsection"><p class="entity-subtitle">All sources</p>${renderList(entity.sourceUrls, 'url')}</div>` : ''}
    </section>
  `;

  const extraSections = Object.entries(entity.extra)
    .map(([key, value]) => {
      return `
        <section class="entity-section">
          <h3>${escapeHtml(titleCaseFromKey(key))}</h3>
          ${renderGenericValue(value)}
        </section>
      `;
    })
    .join('');

  return layout({
    title: `${entity.displayName} — GDER`,
    description: `${entity.displayName} in GDER.`,
    canonicalPath: `/${entity.slug}/`,
    bodyClass: 'page-entity',
    main: `
      <section class="page-card">
        <div class="page-topline">
          <div>
            <p class="eyebrow">Research set</p>
            <h1>${escapeHtml(entity.displayName)}</h1>
            <p class="page-copy">Current public entry in GDER.</p>
          </div>
          <span class="entity-status">${escapeHtml(hasValue(entity.status) ? titleCaseFromKey(entity.status) : 'Research set')}</span>
        </div>
      </section>

      <section class="entity-card">
        <div class="entity-head">
          <div>
            <p class="eyebrow">Entry</p>
            <h2>${escapeHtml(entity.displayName)}</h2>
          </div>
          <div class="entity-actions">${actionButtons}</div>
        </div>

        <div class="entity-grid">${overviewFields}</div>
        ${aliasesSection}
        ${basisSection}
        ${admissionSection}
        ${renderAnchorSection('Governance anchor', entity.governanceAnchor)}
        ${renderAnchorSection('Treasury or control anchor', entity.treasuryAnchor)}
        ${renderOnchainReferences(entity.onchainReferences)}
        ${renderConfidence(entity.confidence)}
        ${canonicalUrlSection}
        ${sourceSection}
        ${notesSection}
        ${extraSections}
      </section>
    `,
  });
}

function fullListPage() {
  const rows = [...mergedEntities]
    .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''))
    .map((entity) => {
      return `
        <a class="list-row" href="/${entity.slug}/">
          <div>
            <span class="entity-status">Research set</span>
            <span class="list-name">${escapeHtml(entity.displayName)}</span>
            <p class="list-meta">${escapeHtml(safe(entity.legalWrapperType, 'Wrapper pending'))} · ${escapeHtml(safe(entity.jurisdiction, 'Jurisdiction pending'))}</p>
          </div>
          <span class="list-row-action">Open</span>
        </a>
      `;
    })
    .join('');

  return layout({
    title: 'Full list — GDER',
    description: 'Full list of current GDER entries.',
    canonicalPath: '/full-list/',
    bodyClass: 'page-list',
    main: `
      <section class="page-card">
        <p class="eyebrow">Full list</p>
        <h1>A public record system for governed digital entities.</h1>
        <p class="page-copy">Full list of current entities.</p>
      </section>

      <section class="list-shell">
        ${rows}
      </section>
    `,
  });
}

function listingPage() {
  return layout({
    title: 'Request listing — GDER',
    description: 'Request a new GDER listing.',
    canonicalPath: '/newlisting/',
    bodyClass: 'page-form',
    main: `
      <section class="page-card">
        <p class="eyebrow">Request listing</p>
        <h1 data-listing-title>Request listing</h1>
        <p class="form-intro" data-listing-intro>
          Fill in the required fields and use an official email address connected to the entity.
        </p>
      </section>

      <section class="form-shell">
        <form data-listing-form novalidate>
          <input type="hidden" name="mode" value="new" data-field-mode />
          <input type="hidden" name="entitySlug" value="" data-field-entity-slug />
          <p class="form-feedback" data-form-feedback hidden aria-live="polite"></p>

          <div class="form-grid">
            <div class="form-field">
              <label class="field-label" for="entityName">Entity name</label>
              <input id="entityName" class="field-input" type="text" name="entityName" required data-field-entity-name />
            </div>
            <div class="form-field">
              <label class="field-label" for="legalName">Legal name</label>
              <input id="legalName" class="field-input" type="text" name="legalName" required />
            </div>
            <div class="form-field">
              <label class="field-label" for="entityType">Entity type</label>
              <input id="entityType" class="field-input" type="text" name="entityType" required />
            </div>
            <div class="form-field">
              <label class="field-label" for="legalWrapperType">Documented wrapper</label>
              <input id="legalWrapperType" class="field-input" type="text" name="legalWrapperType" required />
            </div>
            <div class="form-field">
              <label class="field-label" for="jurisdiction">Jurisdiction</label>
              <input id="jurisdiction" class="field-input" type="text" name="jurisdiction" required />
            </div>
            <div class="form-field">
              <label class="field-label" for="officialWebsite">Official website</label>
              <input id="officialWebsite" class="field-input" type="text" name="officialWebsite" inputmode="url" placeholder="example.org or https://example.org" data-field-website />
              <p class="field-help">Optional. You can enter example.org — GDER will normalize it.</p>
            </div>
            <div class="form-field form-field-wide">
              <label class="field-label" for="governance">Governance</label>
              <textarea id="governance" class="field-textarea" name="governance" required></textarea>
            </div>
            <div class="form-field form-field-wide">
              <label class="field-label" for="operatingControl">Operating control</label>
              <textarea id="operatingControl" class="field-textarea" name="operatingControl" required></textarea>
            </div>
            <div class="form-field form-field-wide">
              <label class="field-label" for="evidenceLinks">Supporting evidence / sources</label>
              <textarea id="evidenceLinks" class="field-textarea" name="evidenceLinks" required></textarea>
            </div>
            <div class="form-field">
              <label class="field-label" for="representativeName">Representative name</label>
              <input id="representativeName" class="field-input" type="text" name="representativeName" required />
            </div>
            <div class="form-field">
              <label class="field-label" for="representativeRole">Representative role</label>
              <input id="representativeRole" class="field-input" type="text" name="representativeRole" required />
            </div>
            <div class="form-field form-field-wide">
              <label class="field-label" for="officialEmail">Official email</label>
              <input id="officialEmail" class="field-input" type="email" name="officialEmail" placeholder="name@entity-domain" required />
            </div>
            <div class="form-field form-field-wide">
              <label class="field-label" for="notes">Additional notes</label>
              <textarea id="notes" class="field-textarea" name="notes"></textarea>
            </div>
          </div>

          <div class="form-actions">
            <button class="button button-primary" type="submit">Send to GDER</button>
            <p class="form-note">This opens an email draft to hello@gder.net with the information you entered. If your mail app does not open, email hello@gder.net directly.</p>
          </div>
        </form>
      </section>
    `,
  });
}

function legalPage({ slug, eyebrow, title, copy, bullets = [] }) {
  const bulletHtml = bullets.length
    ? `<ul class="legal-list">${bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : '';

  return layout({
    title: `${title} — GDER`,
    description: `${title} for GDER.`,
    canonicalPath: `/${slug}/`,
    bodyClass: 'page-legal',
    main: `
      <section class="legal-card">
        <p class="eyebrow">${escapeHtml(eyebrow)}</p>
        <h1>${escapeHtml(title)}</h1>
        <p class="legal-copy">${escapeHtml(copy)}</p>
        ${bulletHtml}
      </section>
    `,
  });
}

function writeSitemap() {
  const staticPaths = ['/', '/full-list/', '/newlisting/', '/terms/', '/privacy/', '/data-security/', '/disclaimers/'];
  const entityPaths = mergedEntities.map((entity) => `/${entity.slug}/`);
  const allPaths = [...staticPaths, ...entityPaths];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPaths
  .map((pathName) => `  <url>\n    <loc>https://gder.net${pathName}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${pathName === '/' ? '1.0' : '0.7'}</priority>\n  </url>`)
  .join('\n')}
</urlset>
`;

  fs.writeFileSync(path.join(root, 'sitemap.xml'), xml);
}

writePage('full-list', fullListPage());
writePage('newlisting', listingPage());
writePage(
  'terms',
  legalPage({
    slug: 'terms',
    eyebrow: 'Legal',
    title: 'Terms',
    copy: 'GDER is a public information and review surface. Visibility, review, and extracts are handled under product rules and may change over time.',
    bullets: [
      'GDER does not sell placement or ranking.',
      'Research-set entries are not the same as reviewed public records.',
      'Use of the site does not create a sovereign-registry relationship.',
    ],
  })
);
writePage(
  'privacy',
  legalPage({
    slug: 'privacy',
    eyebrow: 'Legal',
    title: 'Privacy',
    copy: 'If you contact GDER or submit a listing request, the information you provide may be used to review the request, verify authority, and respond to you.',
    bullets: [
      'Use an official entity email address where possible.',
      'Submitted materials may be reviewed by authorized Old School personnel.',
      'Public display is limited by product status and review outcome.',
    ],
  })
);
writePage(
  'data-security',
  legalPage({
    slug: 'data-security',
    eyebrow: 'Legal',
    title: 'Data security',
    copy: 'GDER is designed to handle listing requests, source material, and review information with controlled access and clear status separation between research and reviewed records.',
    bullets: [
      'Not every submitted item becomes public.',
      'Review access should remain limited to authorized operators.',
      'Representative authority and supporting evidence matter before public reliance.',
    ],
  })
);
writePage(
  'disclaimers',
  legalPage({
    slug: 'disclaimers',
    eyebrow: 'Legal',
    title: 'Disclaimers',
    copy: 'GDER is a governed, publicly inspectable register for digital entities. It is not presented as a sovereign-registry replacement.',
    bullets: [
      'GDER is not a generic crypto directory.',
      'GDER is not pay-to-rank.',
      'Mention in the research set is not the same as verification or review approval.',
    ],
  })
);

for (const entity of mergedEntities) {
  writePage(entity.slug, entityPage(entity));
}

writeSitemap();
