import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const entitiesSource = fs.readFileSync(path.join(root, 'entities.js'), 'utf8');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(entitiesSource, context);

const baseEntities = Array.isArray(context.window.GDER_ENTITIES) ? context.window.GDER_ENTITIES : [];
const normalizedPath = '/home/node/.openclaw/repos/scr-registry/data/dao-candidates/dao-candidates-v0.normalized.json';
const normalizedRecords = fs.existsSync(normalizedPath)
  ? JSON.parse(fs.readFileSync(normalizedPath, 'utf8'))
  : [];
const onchainRefsPath = path.join(root, 'data', 'onchain-references.json');
const onchainRefsById = fs.existsSync(onchainRefsPath)
  ? JSON.parse(fs.readFileSync(onchainRefsPath, 'utf8'))
  : {};

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

function renderAddressList(items) {
  const values = Array.isArray(items) ? items.filter(hasValue) : [];
  if (!values.length) return '';

  const renderedItems = values
    .map((item) => {
      const label = hasValue(item.label) ? `${escapeHtml(item.label)}: ` : '';
      const address = escapeHtml(item.address || '');
      const linkedAddress = hasValue(item.url)
        ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${address}</a>`
        : address;
      const detail = hasValue(item.note) ? ` <span class="entity-inline-note">(${escapeHtml(item.note)})</span>` : '';
      return `<li>${label}${linkedAddress}${detail}</li>`;
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

function formatResearchStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized) return null;

  if (normalized === 'qualified') return 'Included in the current public research set';
  if (normalized === 'candidate') return 'Under internal research review';
  if (normalized === 'pending') return 'Pending additional public evidence';
  if (normalized === 'rejected') return 'Not currently included in the public research set';

  return titleCaseFromKey(status);
}

function renderResearchAssessment(entity) {
  const confidence = entity?.confidence;
  const fields = [
    renderField('Current internal research status', formatResearchStatus(entity?.status)),
    renderField('Internal confidence tier', hasValue(confidence?.tier) ? titleCaseFromKey(confidence.tier) : null),
    renderField('Internal confidence score', confidence?.score),
    renderField('Research inclusion signal', entity?.daoCandidateFlag == null ? null : entity.daoCandidateFlag ? 'Present' : 'Not present'),
    renderField('Confidence rationale', confidence?.rationale),
  ]
    .filter(Boolean)
    .join('');

  if (!fields) return '';

  return `
    <section class="entity-section">
      <h3>Internal research assessment</h3>
      <p class="entity-note">These labels reflect GDER's current internal research handling of public materials. They are not a reviewed-record determination, a legal opinion, or a sovereign-registry decision.</p>
      <div class="entity-grid">${fields}</div>
    </section>
  `;
}

function renderReferenceCard(reference) {
  if (!hasValue(reference)) return '';

  const fields = [
    renderField('Label', reference.label),
    renderField('Network', reference.network),
    renderField('Address', reference.address),
    renderField('Control model', reference.control_model),
    renderField('Treasury address', reference.treasury_address),
    renderField('Threshold', reference.threshold),
  ]
    .filter(Boolean)
    .join('');

  const controllersBlock = hasValue(reference.controllers)
    ? `
      <div class="entity-subsection-inline">
        <p class="entity-subtitle">Controlling addresses</p>
        ${renderAddressList(reference.controllers)}
      </div>
    `
    : '';

  const notesBlock = Array.isArray(reference.notes) && reference.notes.filter(hasValue).length
    ? `
      <div class="entity-subsection-inline">
        <p class="entity-subtitle">Control notes</p>
        ${reference.notes.filter(hasValue).map((note) => `<p class="entity-note">${escapeHtml(note)}</p>`).join('')}
      </div>
    `
    : '';

  const links = [];

  if (hasValue(reference.url)) {
    const primaryLabel = hasValue(reference.source_url) && reference.source_url === reference.url
      ? reference.source_label || 'Open link'
      : 'Open link';
    links.push(
      `<a class="button button-secondary button-compact" href="${escapeHtml(reference.url)}" target="_blank" rel="noreferrer">${escapeHtml(primaryLabel)}</a>`
    );
  }

  if (hasValue(reference.source_url) && reference.source_url !== reference.url) {
    links.push(
      `<a class="button button-secondary button-compact" href="${escapeHtml(reference.source_url)}" target="_blank" rel="noreferrer">${escapeHtml(reference.source_label || 'Source')}</a>`
    );
  }

  if (hasValue(reference.control_source_url) && reference.control_source_url !== reference.source_url && reference.control_source_url !== reference.url) {
    links.push(
      `<a class="button button-secondary button-compact" href="${escapeHtml(reference.control_source_url)}" target="_blank" rel="noreferrer">${escapeHtml(reference.control_source_label || 'Control source')}</a>`
    );
  }

  const renderedLinks = links.join('');

  return `
    <article class="entity-reference-card">
      <div class="entity-grid">${fields}</div>
      ${controllersBlock}
      ${notesBlock}
      ${renderedLinks ? `<div class="entity-reference-links">${renderedLinks}</div>` : ''}
    </article>
  `;
}

function renderOnchainRefs(onchainRefs) {
  if (!hasValue(onchainRefs)) return '';

  const tokenRefs = Array.isArray(onchainRefs.token_refs) ? onchainRefs.token_refs.filter(hasValue) : [];
  const treasuryRefs = Array.isArray(onchainRefs.treasury_refs) ? onchainRefs.treasury_refs.filter(hasValue) : [];
  const notes = Array.isArray(onchainRefs.notes) ? onchainRefs.notes.filter(hasValue) : [];

  const tokenBlock = tokenRefs.length
    ? `
      <div class="entity-subsection">
        <p class="entity-subtitle">Token address</p>
        <div class="entity-reference-list">${tokenRefs.map(renderReferenceCard).join('')}</div>
      </div>
    `
    : '';

  const treasuryBlock = treasuryRefs.length
    ? `
      <div class="entity-subsection">
        <p class="entity-subtitle">Onchain treasury</p>
        <div class="entity-reference-list">${treasuryRefs.map(renderReferenceCard).join('')}</div>
      </div>
    `
    : '';

  const notesBlock = notes.length
    ? `
      <div class="entity-subsection">
        <p class="entity-subtitle">Notes</p>
        ${notes.map((note) => `<p class="entity-note">${escapeHtml(note)}</p>`).join('')}
      </div>
    `
    : '';

  if (!tokenBlock && !treasuryBlock && !notesBlock) return '';

  return `
    <section class="entity-section">
      <h3>Onchain references</h3>
      <p class="entity-note">Links below are convenience references for public inspection. Treasury links are labeled as governance treasuries where the onchain surface belongs to the broader protocol rather than the legal wrapper itself. When verifiable, the control model is shown separately so the page can distinguish multisigs from governance timelocks and other contract-based custody.</p>
      ${tokenBlock}
      ${treasuryBlock}
      ${notesBlock}
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

function navMarkup() {
  return `
        <nav class="site-nav" aria-label="Primary">
          <a href="/full-list/">Research set</a>
          <a href="/#method">Method</a>
          <a class="button button-primary button-compact" href="/newlisting/">Request review</a>
        </nav>`;
}

function footerMarkup() {
  return `
      <footer class="site-footer">
        <div class="footer-brand">
          <p class="footer-product">GDER · Governed Digital Entity Register</p>
          <p class="footer-note">Counterparties-first public inspection.</p>
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
      </footer>`;
}

function trimEnv(name) {
  return process.env[name] ? process.env[name].trim() : '';
}

function joinUrl(base, pathName) {
  if (!base) return '';
  return `${base.replace(/\/+$/, '')}/${pathName.replace(/^\/+/, '')}`;
}

function buildIntakeRuntimeConfig() {
  const functionsBaseUrl = trimEnv('GDER_INTAKE_FUNCTIONS_BASE_URL');
  const endpoints = {
    draft: trimEnv('GDER_INTAKE_DRAFT_ENDPOINT') || joinUrl(functionsBaseUrl, 'intake-draft') || null,
    submit: trimEnv('GDER_INTAKE_SUBMIT_ENDPOINT') || joinUrl(functionsBaseUrl, 'intake-submit') || null,
    confirmEmail: trimEnv('GDER_INTAKE_CONFIRM_EMAIL_ENDPOINT') || joinUrl(functionsBaseUrl, 'intake-confirm-email') || null,
    status: trimEnv('GDER_INTAKE_STATUS_ENDPOINT') || joinUrl(functionsBaseUrl, 'intake-status') || null,
    walletChallenge: trimEnv('GDER_INTAKE_WALLET_CHALLENGE_ENDPOINT') || joinUrl(functionsBaseUrl, 'wallet-challenge') || null,
    walletVerifyTx: trimEnv('GDER_INTAKE_WALLET_VERIFY_TX_ENDPOINT') || joinUrl(functionsBaseUrl, 'wallet-verify-tx') || null,
  };

  return {
    enabled: Object.values(endpoints).some(Boolean),
    publicSiteUrl: trimEnv('GDER_PUBLIC_SITE_URL') || 'https://gder.net',
    functionsBaseUrl: functionsBaseUrl || null,
    endpoints,
    wallet: {
      breadcrumbAddress: trimEnv('GDER_INTAKE_BREADCRUMB_ADDRESS') || null,
      chainId: trimEnv('GDER_INTAKE_WALLET_CHAIN_ID') || null,
      chainLabel: trimEnv('GDER_INTAKE_WALLET_CHAIN_LABEL') || null,
    },
  };
}

const intakeRuntimeConfig = buildIntakeRuntimeConfig();

function renderIntakeConfigScript() {
  const json = JSON.stringify(intakeRuntimeConfig).replace(/</g, '\\u003c');
  return `<script id="gder-intake-config" type="application/json">${json}</script>`;
}

function layout({ title, description, canonicalPath, bodyClass = '', main, headContent = '' }) {
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
    ${headContent}
    <script src="/entities.js" defer></script>
    <script src="/script.js" defer></script>
  </head>
  <body class="${escapeHtml(bodyClass)}">
    <div class="site-shell">
      <header class="site-header">
        <a class="brand-lockup" href="/" aria-label="GDER home">
          <img src="/assets/gder-lockup.svg" alt="GDER by Old School" width="720" height="220" />
        </a>
${navMarkup()}
      </header>

      <main>
        ${main}
      </main>
${footerMarkup()}
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
    onchainRefs: onchainRefsById[normalized?.entity_id || baseEntity.id] || baseEntity.onchainRefs || null,
    notes: normalized?.notes || null,
    extra,
  };
}

const mergedEntities = baseEntities.map(mergeEntity);

function homepage() {
  return layout({
    title: 'GDER — Governed Digital Entity Register',
    description:
      'GDER is a public register for crypto-native entities with documented wrappers, governance, and operating control. It helps counterparties inspect what exists, where it is organized, and what evidence supports it.',
    canonicalPath: '/',
    main: `
      <section class="hero-card hero-grid">
        <div class="hero-copy">
          <p class="eyebrow">Public record system</p>
          <h1>A public record system for governed digital entities.</h1>
          <p class="hero-subhead">
            GDER is a public register for crypto-native entities with documented wrappers, governance, and operating control. It helps counterparties inspect what exists, where it is organized, and what evidence supports it.
          </p>
          <p class="hero-proof">Research is collected. Records are reviewed.</p>

          <div class="hero-actions">
            <a class="button button-primary" href="/newlisting/">Request review</a>
            <a class="button button-secondary" href="/full-list/">Browse research set</a>
          </div>

          <div class="search-block" data-autocomplete-root>
            <label class="search-label" for="entity-search">Search the research set</label>
            <input
              id="entity-search"
              class="search-input"
              type="search"
              placeholder="Enter entity name"
              autocomplete="off"
              spellcheck="false"
              data-search-input
            />
            <div class="search-suggestions" data-search-suggestions hidden></div>
          </div>
        </div>

        <figure class="hero-specimen">
          <figcaption class="artifact-caption">Reviewed record specimen</figcaption>
          <img src="/assets/gder-hero-record.svg" alt="GDER reviewed record specimen" width="896" height="1042" />
          <p class="artifact-support">Reviewed records and portable extracts appear only after structured review.</p>
        </figure>
      </section>

      <section class="trust-band">
        <div class="section-intro-block">
          <p class="eyebrow">How the public site works</p>
          <h2>Three clearly separated public surfaces.</h2>
          <p class="section-copy">GDER should not be read as a flat directory. The public site separates collected research, reviewed records, and verification.</p>
        </div>

        <div class="surface-band">
          <article class="surface-card">
            <h3>Research set</h3>
            <p>Public research entries help counterparties inspect what has been collected so far. They are clearly labeled as research-set entries.</p>
          </article>
          <article class="surface-card">
            <h3>Reviewed record</h3>
            <p>A reviewed record in GDER, supported by structured evidence and verification.</p>
          </article>
          <article class="surface-card">
            <h3>Verify</h3>
            <p>Verification should resolve the underlying record and source evidence.</p>
          </article>
        </div>
      </section>

      <section class="page-card method-card" id="method">
        <div class="method-copy">
          <p class="eyebrow">Method</p>
          <h2>Evidence before confidence.</h2>
          <p class="section-copy">GDER reviews evidence. It does not sell placement or ranking.</p>
          <ul class="method-list">
            <li>Counterparties come first.</li>
            <li>Research-set entries are separate from reviewed records.</li>
            <li>Reviewed records are tied to source evidence.</li>
            <li>Verification should resolve back to the underlying record.</li>
            <li>GDER is not presented as a sovereign-registry replacement.</li>
          </ul>
          <p class="method-support">The point of the public site is legibility, not promotion.</p>
        </div>
        <div class="method-art">
          <img src="/assets/gder-review-flow.svg" alt="GDER review flow" width="1080" height="864" />
        </div>
      </section>

      <section class="page-card preview-card">
        <p class="eyebrow">Public research set</p>
        <h2>Browse current research-set entries.</h2>
        <p class="section-copy">If you are conducting inspection or research, start with the public research set.</p>
        <p class="boundary-note">These are research-set entries. A reviewed record is a different surface and appears only after structured review.</p>
        <div class="preview-actions">
          <a class="button button-secondary" href="/full-list/">Browse research set</a>
        </div>
      </section>

      <section class="request-card request-panel">
        <div>
          <p class="eyebrow">For representatives and authorized delegates</p>
          <h2>Open representative intake.</h2>
          <p class="section-copy">Use representative intake to request a reviewed record or to submit updated evidence for an existing research-set entry. Counterparties should use the research set for inspection, not this intake flow.</p>
          <p class="request-support">Research is public. Reviewed records require structured review and authority checks.</p>
        </div>
        <a class="button button-primary" href="/newlisting/">Representative intake</a>
      </section>
    `,
  });
}

function entityPage(entity) {
  const summaryFields = [
    renderField('Documented wrapper', entity.legalWrapperType),
    renderField('Jurisdiction', entity.jurisdiction),
    renderField('Governance anchor', hasValue(entity.governanceAnchor?.anchor_type) ? titleCaseFromKey(entity.governanceAnchor.anchor_type) : null),
    renderField('Official source', entity.canonicalUrl),
  ]
    .filter(Boolean)
    .join('');

  const detailFields = [
    renderField('Entity ID', entity.entityId),
    renderField('Canonical name', entity.canonicalName),
    renderField('Legal name', entity.legalName),
    renderField('Formation country', entity.formationCountry),
    renderField('Registry type', hasValue(entity.registryType) ? titleCaseFromKey(entity.registryType) : null),
    renderField('Registry ID', entity.registryId),
    renderField('Parent entity', entity.parentEntity),
    renderField('Formation date', entity.formationDate),
  ]
    .filter(Boolean)
    .join('');

  const primaryTokenRef = Array.isArray(entity.onchainRefs?.token_refs)
    ? entity.onchainRefs.token_refs.find(hasValue) || null
    : null;
  const primaryTreasuryRef = Array.isArray(entity.onchainRefs?.treasury_refs)
    ? entity.onchainRefs.treasury_refs.find(hasValue) || null
    : null;

  const representativeActions = [
    `<a class="button button-primary" href="/newlisting/?mode=review&entity=${entity.slug}">Request reviewed record</a>`,
    `<a class="button button-secondary" href="/newlisting/?mode=correction&entity=${entity.slug}">Submit correction / updated evidence</a>`,
  ].join('');

  const referenceButtons = [
    hasValue(entity.canonicalUrl)
      ? `<a class="button button-secondary" href="${escapeHtml(entity.canonicalUrl)}" target="_blank" rel="noreferrer">Official source</a>`
      : '',
    hasValue(primaryTokenRef?.url)
      ? `<a class="button button-secondary" href="${escapeHtml(primaryTokenRef.url)}" target="_blank" rel="noreferrer">Token address</a>`
      : '',
    hasValue(primaryTreasuryRef?.url)
      ? `<a class="button button-secondary" href="${escapeHtml(primaryTreasuryRef.url)}" target="_blank" rel="noreferrer">Treasury</a>`
      : '',
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

  const basisSection = hasValue(entity.basis)
    ? `
      <section class="entity-section">
        <h3>Why this entity appears in GDER</h3>
        <p class="entity-note">This entry appears in GDER because the current public record indicates a governed digital entity with an identifiable wrapper, governance posture, or operating control surface.</p>
        <p class="entity-note entity-note-strong">${escapeHtml(entity.basis)}</p>
      </section>
    `
    : '';

  const sourceSection = `
    <section class="entity-section">
      <h3>Evidence and sources</h3>
      <p class="entity-note">Sources below support the current research-set entry.</p>
      ${hasValue(entity.officialSourceUrls) ? `<div class="entity-subsection"><p class="entity-subtitle">Official sources</p>${renderList(entity.officialSourceUrls, 'url')}</div>` : ''}
      ${hasValue(entity.secondarySourceUrls) ? `<div class="entity-subsection"><p class="entity-subtitle">Secondary sources</p>${renderList(entity.secondarySourceUrls, 'url')}</div>` : ''}
      ${hasValue(entity.sourceUrls) ? `<div class="entity-subsection"><p class="entity-subtitle">All sources</p>${renderList(entity.sourceUrls, 'url')}</div>` : ''}
    </section>
  `;

  const notesSection = hasValue(entity.notes)
    ? `
      <section class="entity-section">
        <h3>Notes</h3>
        <p class="entity-note">${escapeHtml(entity.notes)}</p>
      </section>
    `
    : '';

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
    description: `${entity.displayName} in GDER research set.`,
    canonicalPath: `/${entity.slug}/`,
    bodyClass: 'page-entity',
    main: `
      <section class="page-card entity-intro-card">
        <div class="page-topline">
          <div>
            <p class="eyebrow">Research set</p>
            <h1>${escapeHtml(entity.displayName)}</h1>
            <p class="page-copy">Current public research-set entry in GDER for counterparties, researchers, and representatives who need to inspect collected public materials.</p>
            <p class="boundary-inline">This page is part of the public research set. It is not a reviewed record, not a legal determination, and not a sovereign-registry decision.</p>
          </div>
          <span class="entity-status entity-status-chip">Research set</span>
        </div>
      </section>

      <section class="entity-card entity-summary-card">
        <div class="entity-head">
          <div>
            <p class="eyebrow">Inspection summary</p>
            <h2>${escapeHtml(entity.displayName)}</h2>
          </div>
          <div class="entity-actions entity-actions-primary">
            ${representativeActions}
          </div>
        </div>

        <p class="entity-note entity-note-strong">For counterparties and researchers, use this page to inspect collected public materials. For representatives and authorized delegates, use the actions above to request a reviewed record or to submit corrected or updated evidence.</p>
        <div class="entity-grid">${summaryFields}</div>
        ${referenceButtons ? `<div class="entity-actions entity-actions-secondary">${referenceButtons}</div>` : ''}
        ${basisSection}
        ${renderOnchainRefs(entity.onchainRefs)}
        <section class="entity-section">
          <h3>Evidence and sources</h3>
          ${hasValue(entity.officialSourceUrls) ? `<div class="entity-subsection"><p class="entity-subtitle">Official sources</p>${renderList(entity.officialSourceUrls, 'url')}</div>` : ''}
          ${hasValue(entity.secondarySourceUrls) ? `<div class="entity-subsection"><p class="entity-subtitle">Secondary sources</p>${renderList(entity.secondarySourceUrls, 'url')}</div>` : ''}
          ${hasValue(entity.sourceUrls) ? `<div class="entity-subsection"><p class="entity-subtitle">All sources</p>${renderList(entity.sourceUrls, 'url')}</div>` : ''}
        </section>
        ${renderAnchorSection('Governance anchor', entity.governanceAnchor)}
        ${renderAnchorSection('Treasury or control anchor', entity.treasuryAnchor)}
        ${renderResearchAssessment(entity)}
        ${aliasesSection}
        <section class="entity-section">
          <h3>Entity details</h3>
          <div class="entity-grid">${detailFields}</div>
        </section>
        ${notesSection}
        ${extraSections}
      </section>

      <section class="entity-card correction-card audience-card">
        <div class="audience-grid">
          <article class="audience-panel">
            <p class="eyebrow">For counterparties and researchers</p>
            <h2>Inspect public materials, not a reviewed record.</h2>
            <p class="section-copy">Use this page to inspect the current research-set entry, supporting sources, and public onchain references. If you need a reviewed record for reliance or diligence, request one separately.</p>
            <div class="entity-actions entity-actions-secondary">
              <a class="button button-secondary" href="/full-list/">Back to research set</a>
              ${hasValue(entity.canonicalUrl) ? `<a class="button button-secondary" href="${escapeHtml(entity.canonicalUrl)}" target="_blank" rel="noreferrer">Official source</a>` : ''}
            </div>
          </article>
          <article class="audience-panel audience-panel-accent">
            <p class="eyebrow">For representatives and authorized delegates</p>
            <h2>Choose the right next step.</h2>
            <p class="section-copy">Request a reviewed record when you want GDER to open a formal review for this entity. Submit a correction or updated evidence when this public research-set entry is incomplete, outdated, or incorrect.</p>
            <div class="entity-actions entity-actions-primary">
              <a class="button button-primary" href="/newlisting/?mode=review&entity=${entity.slug}">Request reviewed record</a>
              <a class="button button-secondary" href="/newlisting/?mode=correction&entity=${entity.slug}">Submit correction / updated evidence</a>
            </div>
          </article>
        </div>
      </section>
    `,
  });
}

function fullListPage() {
  const wrapperOptions = [...new Set(mergedEntities.map((entity) => safe(entity.legalWrapperType, 'Wrapper pending')))]
    .sort((a, b) => String(a).localeCompare(String(b)));
  const jurisdictionOptions = [...new Set(mergedEntities.map((entity) => safe(entity.jurisdiction, 'Jurisdiction pending')))]
    .sort((a, b) => String(a).localeCompare(String(b)));

  const rows = [...mergedEntities]
    .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''))
    .map((entity) => {
      const wrapper = safe(entity.legalWrapperType, 'Wrapper pending');
      const jurisdiction = safe(entity.jurisdiction, 'Jurisdiction pending');
      const legalName = safe(entity.legalName, entity.displayName);
      return `
        <a
          class="list-row"
          href="/${entity.slug}/"
          data-list-row
          data-name="${escapeHtml(entity.displayName || '')}"
          data-legal-name="${escapeHtml(legalName)}"
          data-wrapper="${escapeHtml(wrapper)}"
          data-jurisdiction="${escapeHtml(jurisdiction)}"
        >
          <div class="list-row-copy">
            <span class="entity-status">Research set</span>
            <span class="list-name">${escapeHtml(entity.displayName)}</span>
            <p class="list-meta">Current public research-set entry for counterparty inspection. Not a reviewed record.</p>
            <div class="list-meta-tags">
              <span class="list-tag"><strong>Wrapper</strong>${escapeHtml(wrapper)}</span>
              <span class="list-tag"><strong>Jurisdiction</strong>${escapeHtml(jurisdiction)}</span>
            </div>
          </div>
          <span class="list-row-action">Inspect</span>
        </a>
      `;
    })
    .join('');

  return layout({
    title: 'Research set — GDER',
    description: 'Public research-set entries in GDER.',
    canonicalPath: '/full-list/',
    bodyClass: 'page-list',
    main: `
      <section class="page-card">
        <p class="eyebrow">Research set</p>
        <h1>Public research-set entries in GDER.</h1>
        <p class="page-copy">For counterparties and researchers, this page is the inspection surface for current public research-set entries. For representatives, find the entity first, then request a reviewed record or submit updated evidence from its page.</p>
        <div class="page-actions">
          <a class="button button-primary" href="/newlisting/">Representative intake</a>
          <a class="button button-secondary" href="/">Back to home</a>
        </div>
      </section>

      <section class="boundary-band">
        <p>Research-set entries are not the same as reviewed records. This page is a public research surface only. Reviewed records and portable extracts appear only after structured review.</p>
      </section>

      <section class="page-card list-controls-card">
        <div class="list-controls-head">
          <div>
            <p class="eyebrow">Find an entry</p>
            <h2>Search and filter the current research set.</h2>
            <p class="section-copy">Use search, wrapper, jurisdiction, and sort controls to inspect the current public set without conflating it with reviewed records.</p>
          </div>
          <p class="list-results-summary" data-list-results aria-live="polite"></p>
        </div>

        <form class="list-controls" data-list-controls>
          <div class="form-field">
            <label class="field-label" for="listSearch">Search</label>
            <input id="listSearch" class="field-input" type="search" placeholder="Search by entity or legal name" data-list-search />
          </div>
          <div class="form-field">
            <label class="field-label" for="listWrapper">Wrapper</label>
            <select id="listWrapper" class="field-select" data-list-wrapper>
              <option value="">All wrappers</option>
              ${wrapperOptions.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join('')}
            </select>
          </div>
          <div class="form-field">
            <label class="field-label" for="listJurisdiction">Jurisdiction</label>
            <select id="listJurisdiction" class="field-select" data-list-jurisdiction>
              <option value="">All jurisdictions</option>
              ${jurisdictionOptions.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join('')}
            </select>
          </div>
          <div class="form-field">
            <label class="field-label" for="listSort">Sort</label>
            <select id="listSort" class="field-select" data-list-sort>
              <option value="az">Name A–Z</option>
              <option value="za">Name Z–A</option>
            </select>
          </div>
        </form>

        <div class="list-controls-actions">
          <button class="button button-secondary button-compact" type="button" data-list-reset>Clear filters</button>
        </div>
      </section>

      <section class="list-shell">
        <p class="list-helper">Current public research-set entries. Each row links to a research-only entity page.</p>
        <div class="list-rows" data-list-rows>
          ${rows}
        </div>
        <div class="list-empty" data-list-empty hidden>
          <h3>No matching research-set entries.</h3>
          <p class="entity-note">Try clearing one or more filters or broadening the search term.</p>
        </div>
      </section>
    `,
  });
}

function listingPage() {
  return layout({
    title: 'Representative intake — GDER',
    description: 'Request a reviewed record or submit updated evidence for an entity in GDER.',
    canonicalPath: '/newlisting/',
    bodyClass: 'page-form',
    headContent: renderIntakeConfigScript(),
    main: `
      <section class="page-card">
        <p class="eyebrow">Representative intake</p>
        <h1 data-listing-title>Request a reviewed record or submit updated evidence.</h1>
        <p class="form-intro" data-listing-intro>
          This intake is for representatives and authorized delegates. Counterparties and researchers should use the public research set for inspection.
        </p>
        <p class="page-copy">A submission here creates a private case file only. It does not publish a public GDER record automatically.</p>
      </section>

      <section class="page-card intake-state-card">
        <div class="list-controls-head">
          <div>
            <p class="eyebrow">Current intake state</p>
            <h2 data-intake-state-heading>No live private intake backend is connected on this public page.</h2>
            <p class="section-copy" data-intake-state-copy>Your intake is validated, packaged, and saved locally on this device. Nothing is transmitted from this page unless the Supabase endpoints are configured later.</p>
          </div>
          <p class="draft-status-note" data-draft-status aria-live="polite">Draft not saved yet.</p>
        </div>
        <p class="status-chip" data-intake-state-badge>Local-only fallback active</p>
        <p class="form-note">Manual fallback remains available after validation: you can copy the structured summary or download the intake package for delivery to hello@gder.net outside this page.</p>

        <section class="status-grid" data-backend-case-card hidden>
          <article class="status-panel">
            <p class="eyebrow">Private case file</p>
            <dl class="status-list">
              <div><dt>Case reference</dt><dd data-case-reference>Not created yet</dd></div>
              <div><dt>Case status</dt><dd data-case-status>Draft not synced yet</dd></div>
              <div><dt>Email verification</dt><dd data-case-email-status>Not started</dd></div>
              <div><dt>Wallet breadcrumb</dt><dd data-case-wallet-status>Not started</dd></div>
              <div><dt>Last update</dt><dd data-case-updated-at>—</dd></div>
            </dl>
            <button class="button button-secondary button-compact" type="button" data-refresh-status>Refresh status</button>
          </article>
        </section>
      </section>

      <section class="process-strip">
        <div class="process-art">
          <img src="/assets/gder-review-flow.svg" alt="GDER review process" width="1080" height="864" />
        </div>
        <div class="process-steps">
          <span>Choose request type</span>
          <span>Save private draft</span>
          <span>Verify representative email</span>
          <span>Structured review</span>
        </div>
      </section>

      <section class="page-card submission-card" data-submission-card hidden>
        <p class="eyebrow">Structured confirmation</p>
        <h2 data-submission-title>Intake package ready.</h2>
        <p class="page-copy" data-submission-summary>
          Your intake has been validated and saved on this device. Because no live backend is connected yet, it has not been transmitted to GDER from this page.
        </p>
        <ol class="next-steps-list" data-next-steps>
          <li>Keep the saved draft on this device or download the package now.</li>
          <li>Copy the structured summary if you need to deliver it manually.</li>
          <li>Use the package for manual delivery to hello@gder.net while the intake API is offline.</li>
        </ol>
        <div class="form-actions">
          <button class="button button-primary" type="button" data-download-submission>Download intake package</button>
          <button class="button button-secondary" type="button" data-copy-submission>Copy structured summary</button>
          <button class="button button-secondary" type="button" data-return-to-form>Review saved intake</button>
        </div>
        <pre class="submission-preview" data-submission-preview hidden></pre>
      </section>

      <section class="form-shell">
        <form data-listing-form novalidate>
          <input type="hidden" name="mode" value="review" data-field-mode />
          <input type="hidden" name="entitySlug" value="" data-field-entity-slug />
          <input type="hidden" name="walletChallengeReference" value="" data-wallet-challenge-reference />
          <p class="form-feedback" data-form-feedback hidden aria-live="polite"></p>

          <section class="form-section">
            <div class="form-section-head">
              <p class="eyebrow">Step 1</p>
              <h2>Choose the representative task.</h2>
            </div>
            <div class="intent-grid" data-intent-group>
              <label class="intent-card">
                <input type="radio" name="submissionType" value="review" checked data-intent-option />
                <span class="intent-card-copy">
                  <strong>Request reviewed record</strong>
                  <span>Open a formal review path for this entity and provide the evidence GDER should assess.</span>
                </span>
              </label>
              <label class="intent-card">
                <input type="radio" name="submissionType" value="correction" data-intent-option />
                <span class="intent-card-copy">
                  <strong>Submit correction / updated evidence</strong>
                  <span>Update an existing research-set entry when public materials are incomplete, outdated, or wrong.</span>
                </span>
              </label>
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-head">
              <p class="eyebrow">Step 2</p>
              <h2>Entity and public record context.</h2>
            </div>
            <div class="form-grid">
              <div class="form-field">
                <label class="field-label" for="entityName">Entity name</label>
                <input id="entityName" class="field-input" type="text" name="entityName" required data-field-entity-name />
              </div>
              <div class="form-field">
                <label class="field-label" for="legalName">Legal name</label>
                <input id="legalName" class="field-input" type="text" name="legalName" data-required-review="true" />
              </div>
              <div class="form-field">
                <label class="field-label" for="entityType">Entity type</label>
                <input id="entityType" class="field-input" type="text" name="entityType" data-required-review="true" />
              </div>
              <div class="form-field">
                <label class="field-label" for="legalWrapperType">Documented wrapper</label>
                <input id="legalWrapperType" class="field-input" type="text" name="legalWrapperType" data-required-review="true" />
              </div>
              <div class="form-field">
                <label class="field-label" for="jurisdiction">Jurisdiction</label>
                <input id="jurisdiction" class="field-input" type="text" name="jurisdiction" data-required-review="true" />
              </div>
              <div class="form-field">
                <label class="field-label" for="officialWebsite">Official website</label>
                <input id="officialWebsite" class="field-input" type="text" name="officialWebsite" inputmode="url" placeholder="example.org or https://example.org" data-field-website />
                <p class="field-help">Optional. You can enter example.org and GDER will normalize it.</p>
              </div>
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-head">
              <p class="eyebrow">Step 3</p>
              <h2 data-request-scope-title>What GDER should review.</h2>
            </div>
            <div class="form-grid">
              <div class="form-field form-field-wide">
                <label class="field-label" for="requestSummary" data-request-summary-label>Review request summary</label>
                <textarea id="requestSummary" class="field-textarea" name="requestSummary" required data-request-summary></textarea>
                <p class="field-help" data-request-summary-help>State what you want GDER to review and why this request should move forward.</p>
              </div>
              <div class="form-field form-field-wide" data-review-only>
                <label class="field-label" for="governance">Governance</label>
                <textarea id="governance" class="field-textarea" name="governance" data-required-review="true"></textarea>
              </div>
              <div class="form-field form-field-wide" data-review-only>
                <label class="field-label" for="operatingControl">Operating control</label>
                <textarea id="operatingControl" class="field-textarea" name="operatingControl" data-required-review="true"></textarea>
              </div>
              <div class="form-field form-field-wide">
                <label class="field-label" for="evidenceLinks">Evidence URLs</label>
                <textarea id="evidenceLinks" class="field-textarea" name="evidenceLinks" required data-field-evidence></textarea>
                <p class="field-help">Required. Enter one public URL per line. Each line is validated before the package or private case file is saved.</p>
              </div>
              <div class="form-field form-field-wide">
                <label class="field-label" for="notes">Additional notes</label>
                <textarea id="notes" class="field-textarea" name="notes"></textarea>
              </div>
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-head">
              <p class="eyebrow">Step 4</p>
              <h2>Authorized submitter details.</h2>
            </div>
            <div class="form-grid">
              <div class="form-field">
                <label class="field-label" for="representativeName">Representative name</label>
                <input id="representativeName" class="field-input" type="text" name="representativeName" required />
              </div>
              <div class="form-field">
                <label class="field-label" for="representativeRole">Representative role</label>
                <input id="representativeRole" class="field-input" type="text" name="representativeRole" required />
              </div>
              <div class="form-field form-field-wide">
                <label class="field-label" for="officialEmail">Official entity email</label>
                <input id="officialEmail" class="field-input" type="email" name="officialEmail" placeholder="name@entity-domain" required />
                <p class="field-help">This email must be confirmed before the intake becomes fully submitted.</p>
              </div>
            </div>
          </section>

          <section class="form-section" data-wallet-section>
            <div class="form-section-head">
              <p class="eyebrow">Step 5 · Optional</p>
              <h2>Wallet breadcrumb proof.</h2>
            </div>
            <div class="form-grid">
              <div class="form-field">
                <label class="field-label" for="walletAddress">Claimed wallet address</label>
                <input id="walletAddress" class="field-input" type="text" name="walletAddress" placeholder="0x…" data-wallet-address />
              </div>
              <div class="form-field">
                <label class="field-label" for="walletChainId">Wallet chain</label>
                <input id="walletChainId" class="field-input" type="text" name="walletChainId" placeholder="eip155:1" data-wallet-chain />
              </div>
              <div class="form-field form-field-wide">
                <label class="field-label" for="walletTxHash">Wallet breadcrumb transaction hash</label>
                <input id="walletTxHash" class="field-input" type="text" name="walletTxHash" placeholder="0x…" data-wallet-tx />
              </div>
            </div>
            <p class="field-help">Optional. This breadcrumb only supports the claim that the applicant controls the wallet. It does not prove legal authority, governance mandate, or publication rights.</p>
            <p class="wallet-status" data-wallet-status aria-live="polite">Optional. Create a draft first, then request a wallet breadcrumb challenge if you want to prove claimed wallet control.</p>
            <p class="wallet-challenge" data-wallet-challenge>No challenge created yet.</p>
            <div class="form-actions">
              <button class="button button-secondary" type="button" data-create-wallet-challenge>Create wallet challenge</button>
              <button class="button button-secondary" type="button" data-verify-wallet-tx>Verify wallet tx hash</button>
            </div>
          </section>

          <div class="form-actions form-actions-split">
            <div class="form-actions-primary">
              <button class="button button-primary" type="submit">Validate and submit intake</button>
              <button class="button button-secondary" type="button" data-save-draft>Save draft on this device</button>
              <button class="button button-secondary" type="button" data-clear-draft>Clear saved draft</button>
            </div>
            <p class="form-note">This page keeps the local fallback. When Supabase endpoints are configured, drafts sync into a private case file and email verification gates final submission.</p>
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

fs.writeFileSync(path.join(root, 'index.html'), homepage());
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
      'Research-set entries are separate from reviewed records.',
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
    copy: 'If you contact GDER or submit a review request, the information you provide may be used to review the request, verify authority, and respond to you.',
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
    copy: 'GDER is designed to handle review requests, source material, and review information with controlled access and clear status separation between research and reviewed records.',
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
    copy: 'GDER is a governed, publicly inspectable register. It is not presented as a sovereign-registry replacement.',
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
