(function () {
  const entities = Array.isArray(window.GDER_ENTITIES) ? window.GDER_ENTITIES : [];
  const DRAFT_STORAGE_KEY = 'gder:intake-draft:v4';
  const SUBMISSION_STORAGE_KEY = 'gder:intake-last-submission:v4';
  const SERVER_SESSION_STORAGE_KEY = 'gder:intake-server-session:v1';

  function slugify(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function entityPath(entity) {
    return `/${slugify(entity.name)}/`;
  }

  function byName(a, b) {
    return (a.name || '').localeCompare(b.name || '');
  }

  function safeJsonParse(value) {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function formatTimestamp(value) {
    if (!value) return '';
    try {
      return new Date(value).toLocaleString();
    } catch {
      return '';
    }
  }

  function debounce(fn, delay) {
    let timer = null;
    return function () {
      const args = arguments;
      const context = this;
      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        fn.apply(context, args);
      }, delay);
    };
  }

  function normalizeModeValue(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'correction' || normalized === 'edit' ? 'correction' : 'review';
  }

  function normalizeUrl(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    const normalized = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

    try {
      const parsed = new URL(normalized);
      if (!parsed.hostname) return null;
      return parsed.toString();
    } catch {
      return null;
    }
  }

  function normalizeEvidenceUrls(value) {
    const lines = String(value || '')
      .split(/\r?\n/)
      .map(function (item) {
        return item.trim();
      })
      .filter(Boolean);

    if (!lines.length) {
      return { urls: [], invalidLine: null };
    }

    const urls = [];
    for (let index = 0; index < lines.length; index += 1) {
      const normalized = normalizeUrl(lines[index]);
      if (!normalized) {
        return { urls: [], invalidLine: index + 1 };
      }
      urls.push(normalized);
    }

    return { urls, invalidLine: null };
  }

  function normalizeWalletAddress(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    return /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? trimmed : trimmed;
  }

  function normalizeTransactionHash(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    return /^0x[a-fA-F0-9]{64}$/.test(trimmed) ? trimmed.toLowerCase() : trimmed;
  }

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function removeStorage(key) {
    try {
      window.localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  function loadIntakeConfig() {
    if (window.GDER_INTAKE_CONFIG && typeof window.GDER_INTAKE_CONFIG === 'object') {
      return window.GDER_INTAKE_CONFIG;
    }

    const node = document.getElementById('gder-intake-config');
    const parsed = safeJsonParse(node ? node.textContent : '');
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }

    return {
      enabled: false,
      endpoints: {},
      wallet: {},
      publicSiteUrl: window.location.origin,
    };
  }

  async function fetchJson(url, options) {
    const response = await window.fetch(url, options);
    const text = await response.text();
    const payload = safeJsonParse(text);

    if (!response.ok) {
      const message = payload && payload.error && payload.error.message
        ? payload.error.message
        : `Request failed with ${response.status}.`;
      throw new Error(message);
    }

    return payload;
  }

  function setupAutocomplete() {
    const root = document.querySelector('[data-autocomplete-root]');
    const input = document.querySelector('[data-search-input]');
    const suggestions = document.querySelector('[data-search-suggestions]');

    if (!root || !input || !suggestions) return;

    const sortedEntities = [...entities].sort(byName);
    let activeMatches = [];

    function clearSuggestions() {
      suggestions.innerHTML = '';
      suggestions.hidden = true;
      activeMatches = [];
    }

    function goToEntity(entity) {
      if (!entity) return;
      window.location.href = entityPath(entity);
    }

    function renderSuggestions(matches) {
      suggestions.innerHTML = '';
      activeMatches = matches;

      if (!matches.length) {
        clearSuggestions();
        return;
      }

      const list = document.createElement('div');
      list.className = 'suggestion-list';

      for (const entity of matches.slice(0, 8)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'suggestion-item';

        const name = document.createElement('strong');
        name.textContent = entity.name;

        const meta = document.createElement('span');
        const wrapper = entity.legalWrapperType || 'Wrapper pending';
        const jurisdiction = entity.jurisdiction || 'Jurisdiction pending';
        meta.textContent = `${wrapper} · ${jurisdiction}`;

        button.appendChild(name);
        button.appendChild(meta);
        button.addEventListener('click', function () {
          goToEntity(entity);
        });

        list.appendChild(button);
      }

      suggestions.appendChild(list);
      suggestions.hidden = false;
    }

    function updateSuggestions() {
      const value = input.value.trim().toLowerCase();
      if (!value) {
        clearSuggestions();
        return;
      }

      const startsWith = [];
      const includes = [];

      for (const entity of sortedEntities) {
        const name = (entity.name || '').toLowerCase();
        const legal = (entity.legalName || '').toLowerCase();
        if (name.startsWith(value) || legal.startsWith(value)) {
          startsWith.push(entity);
        } else if (name.includes(value) || legal.includes(value)) {
          includes.push(entity);
        }
      }

      renderSuggestions(startsWith.concat(includes));
    }

    input.addEventListener('input', updateSuggestions);

    input.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') return;
      event.preventDefault();

      const value = input.value.trim().toLowerCase();
      if (!value) return;

      const exact = activeMatches.find(function (entity) {
        return (entity.name || '').toLowerCase() === value || (entity.legalName || '').toLowerCase() === value;
      });

      if (exact) {
        goToEntity(exact);
        return;
      }

      if (activeMatches.length === 1) {
        goToEntity(activeMatches[0]);
      }
    });

    document.addEventListener('click', function (event) {
      if (!root.contains(event.target)) {
        clearSuggestions();
      }
    });
  }

  function setupFullListFilters() {
    const controls = document.querySelector('[data-list-controls]');
    const rowsContainer = document.querySelector('[data-list-rows]');
    const searchInput = document.querySelector('[data-list-search]');
    const wrapperSelect = document.querySelector('[data-list-wrapper]');
    const jurisdictionSelect = document.querySelector('[data-list-jurisdiction]');
    const sortSelect = document.querySelector('[data-list-sort]');
    const resetButton = document.querySelector('[data-list-reset]');
    const resultsNodes = Array.from(document.querySelectorAll('[data-list-results]'));
    const emptyState = document.querySelector('[data-list-empty]');

    if (!controls || !rowsContainer || !searchInput || !wrapperSelect || !jurisdictionSelect || !sortSelect) return;

    const rows = Array.from(rowsContainer.querySelectorAll('[data-list-row]'));
    const totalRows = rows.length;

    function rowValue(row, key) {
      return String(row.dataset[key] || '').trim();
    }

    function matchesSearch(row, value) {
      if (!value) return true;
      const haystack = [rowValue(row, 'name'), rowValue(row, 'legalName'), rowValue(row, 'wrapper'), rowValue(row, 'jurisdiction')]
        .join(' ')
        .toLowerCase();
      return haystack.includes(value);
    }

    function updateResults(count) {
      const text = `${count} of ${totalRows} research-set entries shown`;
      for (const node of resultsNodes) {
        node.textContent = text;
      }
    }

    function render() {
      const searchValue = searchInput.value.trim().toLowerCase();
      const wrapperValue = wrapperSelect.value.trim();
      const jurisdictionValue = jurisdictionSelect.value.trim();
      const sortValue = sortSelect.value;

      const visibleRows = rows.filter(function (row) {
        if (!matchesSearch(row, searchValue)) return false;
        if (wrapperValue && rowValue(row, 'wrapper') !== wrapperValue) return false;
        if (jurisdictionValue && rowValue(row, 'jurisdiction') !== jurisdictionValue) return false;
        return true;
      });

      visibleRows.sort(function (a, b) {
        const nameA = rowValue(a, 'name');
        const nameB = rowValue(b, 'name');
        return sortValue === 'za' ? nameB.localeCompare(nameA) : nameA.localeCompare(nameB);
      });

      rowsContainer.innerHTML = '';
      for (const row of visibleRows) {
        row.hidden = false;
        rowsContainer.appendChild(row);
      }

      for (const row of rows) {
        if (!visibleRows.includes(row)) {
          row.hidden = true;
        }
      }

      if (emptyState) {
        emptyState.hidden = visibleRows.length > 0;
      }

      updateResults(visibleRows.length);
    }

    if (resetButton) {
      resetButton.addEventListener('click', function () {
        searchInput.value = '';
        wrapperSelect.value = '';
        jurisdictionSelect.value = '';
        sortSelect.value = 'az';
        render();
      });
    }

    searchInput.addEventListener('input', render);
    wrapperSelect.addEventListener('change', render);
    jurisdictionSelect.addEventListener('change', render);
    sortSelect.addEventListener('change', render);

    render();
  }

  function setupListingForm() {
    const form = document.querySelector('[data-listing-form]');
    if (!form) return;

    const config = loadIntakeConfig();
    const endpoints = config && config.endpoints ? config.endpoints : {};
    const backendAvailable = Boolean(endpoints.draft && endpoints.submit && endpoints.confirmEmail && endpoints.status);
    const params = new URLSearchParams(window.location.search);
    const title = document.querySelector('[data-listing-title]');
    const intro = document.querySelector('[data-listing-intro]');
    const entityNameInput = document.querySelector('[data-field-entity-name]');
    const hiddenMode = document.querySelector('[data-field-mode]');
    const hiddenEntity = document.querySelector('[data-field-entity-slug]');
    const hiddenWalletChallenge = document.querySelector('[data-wallet-challenge-reference]');
    const websiteInput = document.querySelector('[data-field-website]');
    const evidenceInput = document.querySelector('[data-field-evidence]');
    const feedback = document.querySelector('[data-form-feedback]');
    const submissionCard = document.querySelector('[data-submission-card]');
    const submissionTitle = document.querySelector('[data-submission-title]');
    const submissionSummary = document.querySelector('[data-submission-summary]');
    const submissionPreview = document.querySelector('[data-submission-preview]');
    const nextSteps = document.querySelector('[data-next-steps]');
    const draftStatus = document.querySelector('[data-draft-status]');
    const requestScopeTitle = document.querySelector('[data-request-scope-title]');
    const requestSummaryLabel = document.querySelector('[data-request-summary-label]');
    const requestSummaryHelp = document.querySelector('[data-request-summary-help]');
    const saveDraftButton = document.querySelector('[data-save-draft]');
    const clearDraftButton = document.querySelector('[data-clear-draft]');
    const downloadSubmissionButton = document.querySelector('[data-download-submission]');
    const copySubmissionButton = document.querySelector('[data-copy-submission]');
    const returnToFormButton = document.querySelector('[data-return-to-form]');
    const submitButton = form.querySelector('button[type="submit"]');
    const intentOptions = Array.from(form.querySelectorAll('[data-intent-option]'));
    const reviewOnlyBlocks = Array.from(form.querySelectorAll('[data-review-only]'));
    const stateHeading = document.querySelector('[data-intake-state-heading]');
    const stateCopy = document.querySelector('[data-intake-state-copy]');
    const stateBadge = document.querySelector('[data-intake-state-badge]');
    const backendCaseCard = document.querySelector('[data-backend-case-card]');
    const caseReferenceNode = document.querySelector('[data-case-reference]');
    const caseStatusNode = document.querySelector('[data-case-status]');
    const caseEmailStatusNode = document.querySelector('[data-case-email-status]');
    const caseWalletStatusNode = document.querySelector('[data-case-wallet-status]');
    const caseUpdatedNode = document.querySelector('[data-case-updated-at]');
    const caseRefreshButton = document.querySelector('[data-refresh-status]');
    const walletSection = document.querySelector('[data-wallet-section]');
    const walletAddressInput = document.querySelector('[data-wallet-address]');
    const walletChainInput = document.querySelector('[data-wallet-chain]');
    const walletTxInput = document.querySelector('[data-wallet-tx]');
    const walletStatus = document.querySelector('[data-wallet-status]');
    const walletChallenge = document.querySelector('[data-wallet-challenge]');
    const walletChallengeButton = document.querySelector('[data-create-wallet-challenge]');
    const walletVerifyButton = document.querySelector('[data-verify-wallet-tx]');

    let currentSubmission = null;
    let currentCaseStatus = null;
    let draftSyncPromise = null;
    let localDraftRestored = false;

    function entityForSlug(slug) {
      return entities.find(function (item) {
        return slugify(item.name) === slug;
      }) || null;
    }

    function readServerSession() {
      return safeJsonParse(readStorage(SERVER_SESSION_STORAGE_KEY)) || null;
    }

    function writeServerSession(next) {
      const merged = Object.assign({}, readServerSession() || {}, next || {});
      writeStorage(SERVER_SESSION_STORAGE_KEY, JSON.stringify(merged));
      return merged;
    }

    function clearServerSession() {
      removeStorage(SERVER_SESSION_STORAGE_KEY);
    }

    function currentMode() {
      const selected = form.querySelector('[data-intent-option]:checked');
      return normalizeModeValue(selected ? selected.value : hiddenMode && hiddenMode.value ? hiddenMode.value : 'review');
    }

    function setFeedback(message, state) {
      if (!feedback) return;
      feedback.textContent = message;
      feedback.hidden = false;
      feedback.className = `form-feedback form-feedback-${state || 'info'}`;
    }

    function clearFeedback() {
      if (!feedback) return;
      feedback.hidden = true;
      feedback.textContent = '';
      feedback.className = 'form-feedback';
    }

    function setDraftStatus(message) {
      if (!draftStatus) return;
      draftStatus.textContent = message;
    }

    function setWalletStatus(message, tone) {
      if (!walletStatus) return;
      walletStatus.textContent = message;
      walletStatus.dataset.tone = tone || 'muted';
    }

    function clearInvalidState(field) {
      if (!field) return;
      field.removeAttribute('aria-invalid');
    }

    function clearAllInvalidStates() {
      for (const field of form.querySelectorAll('[aria-invalid="true"]')) {
        clearInvalidState(field);
      }
    }

    function fieldLabel(field) {
      if (!field || !field.id) return 'This field';
      const label = form.querySelector(`label[for="${field.id}"]`);
      return label ? label.textContent.trim() : 'This field';
    }

    function focusInvalidField(field, message) {
      if (!field) return false;
      field.setAttribute('aria-invalid', 'true');
      setFeedback(message, 'error');
      field.scrollIntoView({ behavior: 'smooth', block: 'center' });
      field.focus();
      return false;
    }

    function fieldIsRequired(field, mode) {
      if (!field || field.disabled || field.hidden || field.closest('[hidden]')) return false;
      if (field.hasAttribute('required')) return true;
      return mode === 'review' && field.dataset.requiredReview === 'true';
    }

    function setMode(mode, options) {
      const nextMode = normalizeModeValue(mode);
      const silent = Boolean(options && options.silent);

      if (hiddenMode) hiddenMode.value = nextMode;

      for (const input of intentOptions) {
        input.checked = normalizeModeValue(input.value) === nextMode;
      }

      for (const block of reviewOnlyBlocks) {
        block.hidden = nextMode !== 'review';
      }

      if (title) {
        title.textContent = nextMode === 'correction'
          ? 'Submit corrected or updated evidence.'
          : 'Request a reviewed record or submit updated evidence.';
      }

      if (intro) {
        intro.textContent = nextMode === 'correction'
          ? 'Use this intake to correct or update an existing research-set entry from an official entity email address or as an authorized delegate.'
          : 'Use this intake to request a reviewed record from an official entity email address or as an authorized delegate.';
      }

      if (requestScopeTitle) {
        requestScopeTitle.textContent = nextMode === 'correction'
          ? 'What should change in the current research-set entry.'
          : 'What GDER should review.';
      }

      if (requestSummaryLabel) {
        requestSummaryLabel.textContent = nextMode === 'correction'
          ? 'Correction / updated evidence summary'
          : 'Review request summary';
      }

      if (requestSummaryHelp) {
        requestSummaryHelp.textContent = nextMode === 'correction'
          ? 'Describe what is incomplete, outdated, or wrong, and what the corrected public record should reflect.'
          : 'State what you want GDER to review and why this request should move forward.';
      }

      if (submitButton) {
        submitButton.textContent = nextMode === 'correction'
          ? 'Validate and submit correction package'
          : 'Validate and submit intake';
      }

      if (!silent) {
        saveLocalDraft('Draft saved after request type update.');
      }
    }

    function serializeForm() {
      const formData = new FormData(form);
      const values = {};
      for (const pair of formData.entries()) {
        values[pair[0]] = pair[1];
      }
      values.mode = currentMode();
      values.submissionType = currentMode();
      values.walletAddress = normalizeWalletAddress(values.walletAddress);
      values.walletTxHash = normalizeTransactionHash(values.walletTxHash);
      return values;
    }

    function applySerializedForm(values) {
      if (!values || typeof values !== 'object') return;
      Object.entries(values).forEach(function (entry) {
        const name = entry[0];
        const value = entry[1];
        const field = form.elements.namedItem(name);
        if (!field) return;

        if (field instanceof RadioNodeList) return;

        if (field.type === 'radio') {
          field.checked = field.value === value;
          return;
        }

        if (field.type === 'checkbox') {
          field.checked = value === true || String(value) === field.value;
          return;
        }

        field.value = value == null ? '' : String(value);
      });

      setMode(values.mode || values.submissionType || 'review', { silent: true });
    }

    function saveLocalDraft(statusMessage) {
      const payload = {
        savedAt: new Date().toISOString(),
        values: serializeForm(),
      };

      if (writeStorage(DRAFT_STORAGE_KEY, JSON.stringify(payload))) {
        setDraftStatus(statusMessage || `Draft saved on this device · ${formatTimestamp(payload.savedAt)}`);
      } else {
        setDraftStatus('Draft could not be saved in this browser.');
      }
    }

    function restoreLocalDraft() {
      const payload = safeJsonParse(readStorage(DRAFT_STORAGE_KEY));
      if (!payload || !payload.values) return false;
      applySerializedForm(payload.values);
      setDraftStatus(`Draft restored · ${formatTimestamp(payload.savedAt)}`);
      return true;
    }

    function prefillEntityFields(entity, preserveExisting) {
      if (!entity) return;

      const fieldMap = {
        entityName: entity.name || '',
        legalName: entity.legalName || '',
        entityType: entity.entityType || '',
        legalWrapperType: entity.legalWrapperType || '',
        jurisdiction: entity.jurisdiction || '',
        officialWebsite: entity.canonicalUrl || ''
      };

      Object.entries(fieldMap).forEach(function (entry) {
        const name = entry[0];
        const value = entry[1];
        const field = form.elements.namedItem(name);
        if (!field || !value) return;
        if (preserveExisting && String(field.value || '').trim()) return;
        field.value = value;
      });
    }

    function clearDraft() {
      removeStorage(DRAFT_STORAGE_KEY);
      removeStorage(SUBMISSION_STORAGE_KEY);
      clearServerSession();
      form.reset();
      clearAllInvalidStates();
      clearFeedback();
      currentSubmission = null;
      currentCaseStatus = null;
      if (submissionCard) submissionCard.hidden = true;
      if (backendCaseCard) backendCaseCard.hidden = true;

      const requestedMode = normalizeModeValue(params.get('mode') || 'review');
      const requestedEntitySlug = params.get('entity');
      setMode(requestedMode, { silent: true });

      if (requestedEntitySlug && hiddenEntity) {
        hiddenEntity.value = requestedEntitySlug;
      }

      const matchedEntity = requestedEntitySlug ? entityForSlug(requestedEntitySlug) : null;
      prefillEntityFields(matchedEntity, false);
      if (hiddenWalletChallenge) hiddenWalletChallenge.value = '';
      setDraftStatus('Saved draft cleared from this device.');
      renderConnectionState();
      renderApplicantStatus();
      renderWalletStatus();
    }

    function validateForm() {
      const mode = currentMode();
      clearFeedback();
      clearAllInvalidStates();

      const fields = Array.from(form.querySelectorAll('input, textarea, select'));
      for (const field of fields) {
        if (field.type === 'button' || field.type === 'submit' || field.type === 'hidden') continue;
        if (!fieldIsRequired(field, mode)) continue;
        if (!String(field.value || '').trim()) {
          return focusInvalidField(field, `${fieldLabel(field)} is required.`);
        }
      }

      const emailField = form.querySelector('[name="officialEmail"]');
      const emailValue = String(emailField && emailField.value || '').trim();
      if (emailField && emailValue && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
        return focusInvalidField(emailField, 'Official entity email must be a valid email address.');
      }

      if (websiteInput) {
        const normalizedWebsite = normalizeUrl(websiteInput.value);
        if (String(websiteInput.value || '').trim() && !normalizedWebsite) {
          return focusInvalidField(websiteInput, 'Official website must look like example.org or https://example.org.');
        }
        websiteInput.value = normalizedWebsite || '';
      }

      if (evidenceInput) {
        const evidence = normalizeEvidenceUrls(evidenceInput.value);
        if (!evidence.urls.length) {
          return focusInvalidField(evidenceInput, 'Evidence URLs are required. Enter at least one public URL.');
        }
        if (evidence.invalidLine) {
          return focusInvalidField(evidenceInput, `Evidence URL on line ${evidence.invalidLine} is not valid.`);
        }
        evidenceInput.value = evidence.urls.join('\n');
      }

      if (walletAddressInput && String(walletAddressInput.value || '').trim()) {
        walletAddressInput.value = normalizeWalletAddress(walletAddressInput.value);
        if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddressInput.value)) {
          return focusInvalidField(walletAddressInput, 'Claimed wallet must be a valid 0x-prefixed EVM address.');
        }
      }

      if (walletTxInput && String(walletTxInput.value || '').trim()) {
        walletTxInput.value = normalizeTransactionHash(walletTxInput.value);
        if (!/^0x[a-fA-F0-9]{64}$/.test(walletTxInput.value)) {
          return focusInvalidField(walletTxInput, 'Wallet transaction hash must be a valid 0x-prefixed transaction hash.');
        }
      }

      return true;
    }

    function buildSubmissionPayload() {
      const formData = new FormData(form);
      const mode = currentMode();
      const entityName = String(formData.get('entityName') || '').trim();
      const entitySlug = String(formData.get('entitySlug') || '').trim() || slugify(entityName);
      const evidenceUrls = String(formData.get('evidenceLinks') || '')
        .split(/\r?\n/)
        .map(function (item) {
          return item.trim();
        })
        .filter(Boolean);
      const now = new Date().toISOString();
      const session = readServerSession();

      return {
        submissionId: `gder-${entitySlug || 'entity'}-${now.replace(/[^0-9]/g, '').slice(0, 14)}`,
        submittedAt: now,
        route: '/newlisting/',
        delivery: {
          hasLiveBackend: backendAvailable,
          functions: backendAvailable ? endpoints : null,
          caseReference: session && session.caseReference ? session.caseReference : null,
          statusToken: session && session.statusToken ? session.statusToken : null,
          method: backendAvailable ? 'SUPABASE_FUNCTIONS' : 'LOCAL_PACKAGE'
        },
        request: {
          type: mode,
          entitySlug,
          entity: {
            name: entityName,
            legalName: String(formData.get('legalName') || '').trim(),
            entityType: String(formData.get('entityType') || '').trim(),
            documentedWrapper: String(formData.get('legalWrapperType') || '').trim(),
            jurisdiction: String(formData.get('jurisdiction') || '').trim(),
            officialWebsite: String(formData.get('officialWebsite') || '').trim()
          },
          reviewScope: {
            summary: String(formData.get('requestSummary') || '').trim(),
            governance: String(formData.get('governance') || '').trim(),
            operatingControl: String(formData.get('operatingControl') || '').trim(),
            evidenceUrls,
            notes: String(formData.get('notes') || '').trim()
          },
          submitter: {
            name: String(formData.get('representativeName') || '').trim(),
            role: String(formData.get('representativeRole') || '').trim(),
            officialEmail: String(formData.get('officialEmail') || '').trim()
          },
          walletBreadcrumb: {
            claimedAddress: normalizeWalletAddress(formData.get('walletAddress')),
            chainId: String(formData.get('walletChainId') || '').trim(),
            challengeReference: String(formData.get('walletChallengeReference') || '').trim(),
            transactionHash: normalizeTransactionHash(formData.get('walletTxHash'))
          }
        },
        backend: currentCaseStatus || null
      };
    }

    function buildSubmissionSummary(payload) {
      const typeLabel = payload.request.type === 'correction' ? 'Correction / updated evidence' : 'Request reviewed record';
      const wallet = payload.request.walletBreadcrumb || {};
      const lines = [
        'GDER representative intake',
        `Submission ID: ${payload.submissionId}`,
        `Submitted at: ${payload.submittedAt}`,
        `Delivery mode: ${payload.delivery.method}`,
        `Case reference: ${payload.delivery.caseReference || '—'}`,
        `Request type: ${typeLabel}`,
        `Entity name: ${payload.request.entity.name}`,
        `Legal name: ${payload.request.entity.legalName || '—'}`,
        `Entity type: ${payload.request.entity.entityType || '—'}`,
        `Documented wrapper: ${payload.request.entity.documentedWrapper || '—'}`,
        `Jurisdiction: ${payload.request.entity.jurisdiction || '—'}`,
        `Official website: ${payload.request.entity.officialWebsite || '—'}`,
        `Summary: ${payload.request.reviewScope.summary || '—'}`,
        `Governance: ${payload.request.reviewScope.governance || '—'}`,
        `Operating control: ${payload.request.reviewScope.operatingControl || '—'}`,
        'Evidence URLs:',
        payload.request.reviewScope.evidenceUrls.length
          ? payload.request.reviewScope.evidenceUrls.map(function (url) { return `- ${url}`; }).join('\n')
          : '- —',
        `Additional notes: ${payload.request.reviewScope.notes || '—'}`,
        `Representative name: ${payload.request.submitter.name}`,
        `Representative role: ${payload.request.submitter.role}`,
        `Official entity email: ${payload.request.submitter.officialEmail}`,
        `Claimed wallet address: ${wallet.claimedAddress || '—'}`,
        `Wallet chain: ${wallet.chainId || '—'}`,
        `Wallet challenge reference: ${wallet.challengeReference || '—'}`,
        `Wallet transaction hash: ${wallet.transactionHash || '—'}`,
        'Wallet disclaimer: Wallet breadcrumb only supports a claimed wallet-control assertion, not legal authority.'
      ];

      return lines.join('\n');
    }

    function persistLastSubmission(payload) {
      writeStorage(SUBMISSION_STORAGE_KEY, JSON.stringify(payload));
    }

    function caseStatusLabel(status) {
      const normalized = String(status || '').trim();
      if (!normalized) return 'Draft only';
      return normalized.replace(/_/g, ' ');
    }

    function emailStatusLabel(status) {
      if (!status) return 'Not started';
      return String(status).replace(/_/g, ' ');
    }

    function walletStatusLabel(status) {
      if (!status) return 'Not started';
      return String(status).replace(/_/g, ' ');
    }

    function renderConnectionState() {
      if (stateHeading) {
        stateHeading.textContent = backendAvailable
          ? 'Live private intake backend is connected on this page.'
          : 'No live private intake backend is connected on this page.';
      }

      if (stateCopy) {
        stateCopy.textContent = backendAvailable
          ? 'Drafts can sync into a private Supabase case file here. Submission still remains private, and email verification is required before the case becomes fully submitted.'
          : 'Your intake is still validated and packaged locally on this device. Nothing is transmitted from this page unless the Supabase endpoints are configured later.';
      }

      if (stateBadge) {
        stateBadge.textContent = backendAvailable ? 'Live private case sync available' : 'Local-only fallback active';
      }
    }

    function renderApplicantStatus() {
      if (!backendCaseCard) return;
      if (!backendAvailable) {
        backendCaseCard.hidden = true;
        return;
      }

      const session = readServerSession();
      if (!session || !session.caseReference) {
        backendCaseCard.hidden = false;
        if (caseReferenceNode) caseReferenceNode.textContent = 'Not created yet';
        if (caseStatusNode) caseStatusNode.textContent = 'Draft not synced yet';
        if (caseEmailStatusNode) caseEmailStatusNode.textContent = 'Not started';
        if (caseWalletStatusNode) caseWalletStatusNode.textContent = 'Not started';
        if (caseUpdatedNode) caseUpdatedNode.textContent = '—';
        return;
      }

      backendCaseCard.hidden = false;
      if (caseReferenceNode) caseReferenceNode.textContent = session.caseReference;
      if (caseStatusNode) caseStatusNode.textContent = caseStatusLabel(currentCaseStatus && currentCaseStatus.status);
      if (caseEmailStatusNode) {
        caseEmailStatusNode.textContent = emailStatusLabel(
          currentCaseStatus && currentCaseStatus.emailVerification && currentCaseStatus.emailVerification.status
        );
      }
      if (caseWalletStatusNode) {
        caseWalletStatusNode.textContent = walletStatusLabel(
          currentCaseStatus && currentCaseStatus.wallet && currentCaseStatus.wallet.proofStatus
        );
      }
      if (caseUpdatedNode) {
        caseUpdatedNode.textContent = formatTimestamp(currentCaseStatus && currentCaseStatus.updatedAt);
      }
    }

    function renderWalletStatus() {
      if (!walletSection) return;
      const session = readServerSession();
      const currentWallet = currentCaseStatus && currentCaseStatus.wallet ? currentCaseStatus.wallet : null;
      const latestChallenge = currentWallet && currentWallet.latestChallenge ? currentWallet.latestChallenge : null;

      if (walletChallengeButton) {
        walletChallengeButton.disabled = !backendAvailable;
      }
      if (walletVerifyButton) {
        walletVerifyButton.disabled = !backendAvailable;
      }

      if (!backendAvailable) {
        setWalletStatus('Optional wallet proof will stay inside the local intake package until the Supabase wallet endpoints are configured.', 'muted');
        if (walletChallenge) {
          walletChallenge.hidden = false;
          walletChallenge.textContent = 'No live challenge endpoint is connected. You can still record the claimed wallet and transaction hash in the local package.';
        }
        return;
      }

      if (!session || !session.caseReference) {
        setWalletStatus('Optional. Create a draft first, then request a wallet breadcrumb challenge if you want to prove claimed wallet control.', 'muted');
        if (walletChallenge) {
          walletChallenge.hidden = false;
          walletChallenge.textContent = 'No challenge created yet.';
        }
        return;
      }

      if (latestChallenge) {
        if (hiddenWalletChallenge && !hiddenWalletChallenge.value) {
          hiddenWalletChallenge.value = latestChallenge.challengeReference || '';
        }
        if (walletChallenge) {
          walletChallenge.hidden = false;
          walletChallenge.textContent = `Send the exact amount ${latestChallenge.exactAmountWei} wei from the claimed wallet to ${latestChallenge.breadcrumbAddress}. Challenge ${latestChallenge.challengeReference} expires ${formatTimestamp(latestChallenge.expiresAt)}.`;
        }
      } else if (walletChallenge) {
        walletChallenge.hidden = false;
        walletChallenge.textContent = 'No challenge created yet.';
      }

      if (currentWallet && currentWallet.proofStatus) {
        setWalletStatus(
          `Wallet proof status: ${walletStatusLabel(currentWallet.proofStatus)}. This only supports a claimed wallet-control breadcrumb, not legal authority.`,
          currentWallet.proofStatus === 'verified' ? 'success' : currentWallet.proofStatus === 'rejected' ? 'error' : 'info'
        );
      }
    }

    function showSubmissionState(payload, options) {
      const backendResponse = options && options.backend ? options.backend : null;
      const posted = Boolean(options && options.posted);
      const error = options && options.error ? String(options.error) : '';
      currentSubmission = payload;
      persistLastSubmission(payload);

      if (submissionCard) {
        submissionCard.hidden = false;
      }

      if (backendResponse && submissionTitle) {
        if (backendResponse.status === 'email_pending') {
          submissionTitle.textContent = 'Confirm your representative email.';
        } else if (backendResponse.status === 'submitted') {
          submissionTitle.textContent = 'Submission received.';
        } else {
          submissionTitle.textContent = 'Private case file updated.';
        }
      } else if (submissionTitle) {
        submissionTitle.textContent = posted ? 'Submission received.' : 'Intake package ready.';
      }

      if (submissionSummary) {
        if (backendResponse && backendResponse.status === 'email_pending') {
          submissionSummary.textContent = 'Your private case file was saved. Check the representative email inbox and confirm it before the intake becomes fully submitted.';
        } else if (backendResponse && backendResponse.status === 'submitted') {
          submissionSummary.textContent = 'Your private case file is submitted. It is still not a public GDER record, and no automatic publication path exists from this flow.';
        } else if (posted) {
          submissionSummary.textContent = 'Your intake was submitted from this page and stored locally as a confirmation package.';
        } else if (error) {
          submissionSummary.textContent = `Live submission was unavailable. A local intake package has been prepared instead. ${error}`;
        } else {
          submissionSummary.textContent = 'Your intake was validated and saved on this device. Because no live backend is connected on this page, it has not been transmitted from here; use the saved package for manual delivery to hello@gder.net.';
        }
      }

      if (nextSteps) {
        const items = backendResponse && backendResponse.status === 'email_pending'
          ? [
              'Open the representative email inbox and use the confirmation link.',
              'Keep the local package as your own confirmation copy.',
              'Use the same case reference for follow-up materials if GDER asks for more evidence.'
            ]
          : backendResponse && backendResponse.status === 'submitted'
            ? [
                'Keep the saved package as your local confirmation copy.',
                'Remember: submission created a private case file, not a public record.',
                'Use the same case reference if you need to send follow-up evidence.'
              ]
            : posted
              ? [
                  'Keep the saved package as your local confirmation copy.',
                  'If GDER needs follow-up material, use the same evidence structure for continuity.',
                  'Return to the form below if you need to amend the submission.'
                ]
              : [
                  'Keep the saved draft on this device or download the package now.',
                  'Copy the structured summary if you need to deliver it manually.',
                  'Use the package for manual delivery to hello@gder.net while the intake API is offline.'
                ];
        nextSteps.innerHTML = items.map(function (item) {
          return `<li>${item}</li>`;
        }).join('');
      }

      if (submissionPreview) {
        submissionPreview.hidden = false;
        submissionPreview.textContent = buildSubmissionSummary(payload);
      }

      if (backendResponse && backendResponse.status === 'email_pending') {
        setFeedback('Private case file saved. Email verification is now required before the intake becomes fully submitted.', 'success');
      } else if (backendResponse && backendResponse.status === 'submitted') {
        setFeedback('Submission received. The case file remains private unless GDER separately approves any later publication path.', 'success');
      } else if (posted) {
        setFeedback('Submission sent successfully and stored locally as a confirmation package.', 'success');
      } else if (error) {
        setFeedback(`Live submission was unavailable. A local intake package has been prepared instead. ${error}`, 'info');
      } else {
        setFeedback('No live backend is connected. A local intake package has been prepared and saved instead.', 'success');
      }

      saveLocalDraft(`Draft saved on this device · ${formatTimestamp(payload.submittedAt)}`);

      if (submissionCard) {
        submissionCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    function hasMeaningfulDraftData() {
      const values = serializeForm();
      return Object.entries(values).some(function (entry) {
        const name = entry[0];
        const value = String(entry[1] || '').trim();
        if (!value) return false;
        return !['mode', 'submissionType', 'entitySlug', 'walletChallengeReference'].includes(name);
      });
    }

    async function syncDraft(options) {
      if (!backendAvailable || !endpoints.draft) return null;
      if (!hasMeaningfulDraftData() && !(readServerSession() && readServerSession().draftToken)) return null;
      if (draftSyncPromise && !(options && options.force)) return draftSyncPromise;

      const session = readServerSession();
      const requestPayload = {
        draftToken: session && session.draftToken ? session.draftToken : null,
        form: serializeForm(),
        attachments: []
      };

      draftSyncPromise = fetchJson(endpoints.draft, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload)
      }).then(function (response) {
        if (!response) return null;
        writeServerSession({
          caseReference: response.caseReference,
          draftToken: response.draftToken,
          statusToken: response.statusToken,
          updatedAt: response.updatedAt
        });
        currentCaseStatus = {
          caseReference: response.caseReference,
          status: response.status,
          updatedAt: response.updatedAt,
          emailVerification: {
            status: response.emailVerifiedAt ? 'verified' : response.status === 'email_pending' ? 'pending' : 'not_started',
            verifiedAt: response.emailVerifiedAt || null
          },
          wallet: {
            proofStatus: response.walletProofStatus || 'not_started',
            claimedAddress: serializeForm().walletAddress || null,
            chainId: serializeForm().walletChainId || null,
            latestChallenge: currentCaseStatus && currentCaseStatus.wallet ? currentCaseStatus.wallet.latestChallenge : null,
            latestProof: currentCaseStatus && currentCaseStatus.wallet ? currentCaseStatus.wallet.latestProof : null
          }
        };
        setDraftStatus(`Private draft synced · ${formatTimestamp(response.updatedAt)}`);
        renderApplicantStatus();
        renderWalletStatus();
        return response;
      }).catch(function (error) {
        if (options && options.loud) {
          setFeedback(`Private draft sync failed. Local draft is still available. ${error.message || ''}`.trim(), 'info');
        }
        setDraftStatus('Local draft saved. Private sync is unavailable right now.');
        return null;
      }).finally(function () {
        draftSyncPromise = null;
      });

      return draftSyncPromise;
    }

    async function hydrateDraftFromServer() {
      if (!backendAvailable || !endpoints.draft) return false;
      const session = readServerSession();
      if (!session || !session.draftToken) return false;

      try {
        const response = await fetchJson(`${endpoints.draft}?draft_token=${encodeURIComponent(session.draftToken)}`);
        if (response && response.draft && response.draft.formValues && !localDraftRestored) {
          applySerializedForm(response.draft.formValues);
          localDraftRestored = true;
          setDraftStatus(`Private draft restored · ${formatTimestamp(response.updatedAt)}`);
        }
        writeServerSession({
          caseReference: response.caseReference,
          draftToken: response.draftToken,
          statusToken: response.statusToken,
          updatedAt: response.updatedAt
        });
        return true;
      } catch {
        return false;
      }
    }

    async function fetchApplicantStatus(options) {
      if (!backendAvailable || !endpoints.status) return null;
      const session = readServerSession();
      if (!session || !session.caseReference || !session.statusToken) return null;

      try {
        const response = await fetchJson(endpoints.status, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caseReference: session.caseReference,
            statusToken: session.statusToken
          })
        });
        currentCaseStatus = response;
        renderApplicantStatus();
        renderWalletStatus();
        return response;
      } catch (error) {
        if (options && options.loud) {
          setFeedback(`Status refresh failed. ${error.message || ''}`.trim(), 'info');
        }
        return null;
      }
    }

    async function confirmEmailFromQuery() {
      if (!backendAvailable || !endpoints.confirmEmail) return;
      const token = params.get('email_challenge');
      if (!token) return;

      setFeedback('Confirming representative email…', 'info');

      try {
        const response = await fetchJson(endpoints.confirmEmail, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: token })
        });
        currentCaseStatus = response;
        if (response && response.caseReference) {
          writeServerSession({ caseReference: response.caseReference });
        }
        renderApplicantStatus();
        renderWalletStatus();
        setFeedback('Representative email confirmed. The private intake case is now submitted.', 'success');
        params.delete('email_challenge');
        const nextQuery = params.toString();
        const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash || ''}`;
        window.history.replaceState({}, '', nextUrl);
      } catch (error) {
        setFeedback(`Email confirmation failed. ${error.message || ''}`.trim(), 'error');
      }
    }

    async function createWalletChallenge() {
      if (!backendAvailable || !endpoints.walletChallenge) {
        setWalletStatus('Wallet challenge endpoint is not configured.', 'muted');
        return;
      }

      if (!walletAddressInput || !String(walletAddressInput.value || '').trim()) {
        focusInvalidField(walletAddressInput, 'Enter the claimed wallet address before creating a breadcrumb challenge.');
        return;
      }

      walletAddressInput.value = normalizeWalletAddress(walletAddressInput.value);
      if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddressInput.value)) {
        focusInvalidField(walletAddressInput, 'Claimed wallet must be a valid 0x-prefixed EVM address.');
        return;
      }

      const savedDraft = await syncDraft({ force: true, loud: true });
      const session = readServerSession();
      if (!savedDraft && !(session && session.draftToken)) {
        setWalletStatus('Create or sync a private draft before requesting a wallet challenge.', 'error');
        return;
      }

      setWalletStatus('Creating wallet breadcrumb challenge…', 'info');

      try {
        const response = await fetchJson(endpoints.walletChallenge, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draftToken: (readServerSession() || {}).draftToken,
            walletAddress: walletAddressInput.value,
            chainId: walletChainInput && walletChainInput.value ? walletChainInput.value : null
          })
        });
        if (hiddenWalletChallenge) {
          hiddenWalletChallenge.value = response.wallet.challengeReference || '';
        }
        if (walletChainInput && response.wallet.chainId) {
          walletChainInput.value = response.wallet.chainId;
        }
        currentCaseStatus = Object.assign({}, currentCaseStatus || {}, {
          caseReference: response.caseReference,
          wallet: {
            claimedAddress: response.wallet.claimedAddress,
            chainId: response.wallet.chainId,
            proofStatus: response.wallet.proofStatus,
            latestChallenge: {
              challengeReference: response.wallet.challengeReference,
              breadcrumbAddress: response.wallet.breadcrumbAddress,
              exactAmountWei: response.wallet.exactAmountWei,
              expiresAt: response.wallet.expiresAt,
              status: 'pending'
            },
            latestProof: currentCaseStatus && currentCaseStatus.wallet ? currentCaseStatus.wallet.latestProof : null
          }
        });
        renderApplicantStatus();
        renderWalletStatus();
        setWalletStatus('Wallet challenge created. Send the exact amount from the claimed wallet, then verify the transaction hash below.', 'success');
        saveLocalDraft();
      } catch (error) {
        setWalletStatus(`Wallet challenge creation failed. ${error.message || ''}`.trim(), 'error');
      }
    }

    async function verifyWalletTransaction() {
      if (!backendAvailable || !endpoints.walletVerifyTx) {
        setWalletStatus('Wallet verification endpoint is not configured.', 'muted');
        return;
      }

      const session = readServerSession();
      const challengeReference = hiddenWalletChallenge && hiddenWalletChallenge.value ? hiddenWalletChallenge.value : '';
      if (!session || !session.draftToken) {
        setWalletStatus('Create or restore the private draft before verifying a wallet transaction.', 'error');
        return;
      }
      if (!challengeReference) {
        setWalletStatus('Create a wallet breadcrumb challenge first.', 'error');
        return;
      }
      if (!walletTxInput || !String(walletTxInput.value || '').trim()) {
        focusInvalidField(walletTxInput, 'Enter the wallet transaction hash you want GDER to verify.');
        return;
      }

      walletTxInput.value = normalizeTransactionHash(walletTxInput.value);
      if (!/^0x[a-fA-F0-9]{64}$/.test(walletTxInput.value)) {
        focusInvalidField(walletTxInput, 'Wallet transaction hash must be a valid 0x-prefixed EVM transaction hash.');
        return;
      }

      setWalletStatus('Verifying wallet breadcrumb transaction…', 'info');

      try {
        const response = await fetchJson(endpoints.walletVerifyTx, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draftToken: session.draftToken,
            challengeReference: challengeReference,
            transactionHash: walletTxInput.value
          })
        });
        currentCaseStatus = Object.assign({}, currentCaseStatus || {}, {
          caseReference: response.caseReference,
          wallet: Object.assign({}, currentCaseStatus && currentCaseStatus.wallet ? currentCaseStatus.wallet : {}, {
            proofStatus: response.wallet.proofStatus,
            latestProof: {
              transactionHash: response.wallet.transactionHash,
              verificationState: response.wallet.verificationState,
              verifiedAt: response.wallet.detail && response.wallet.detail.blockNumber ? new Date().toISOString() : null
            }
          })
        });
        renderApplicantStatus();
        renderWalletStatus();
        setWalletStatus(`Wallet verification result: ${walletStatusLabel(response.wallet.proofStatus)}. ${response.wallet.disclaimer}`, response.wallet.proofStatus === 'verified' ? 'success' : response.wallet.proofStatus === 'rejected' ? 'error' : 'info');
        saveLocalDraft();
      } catch (error) {
        setWalletStatus(`Wallet verification failed. ${error.message || ''}`.trim(), 'error');
      }
    }

    function downloadCurrentSubmission() {
      if (!currentSubmission) return;
      const fileName = `${currentSubmission.submissionId}.json`;
      const blob = new Blob([JSON.stringify(currentSubmission, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setFeedback('Intake package downloaded.', 'success');
    }

    function copyCurrentSubmission() {
      if (!currentSubmission) return;
      const text = buildSubmissionSummary(currentSubmission);

      function onSuccess() {
        setFeedback('Structured summary copied to clipboard.', 'success');
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(onSuccess).catch(function () {
          const helper = document.createElement('textarea');
          helper.value = text;
          document.body.appendChild(helper);
          helper.select();
          document.execCommand('copy');
          helper.remove();
          onSuccess();
        });
        return;
      }

      const helper = document.createElement('textarea');
      helper.value = text;
      document.body.appendChild(helper);
      helper.select();
      document.execCommand('copy');
      helper.remove();
      onSuccess();
    }

    const requestedMode = normalizeModeValue(params.get('mode') || 'review');
    const requestedEntitySlug = params.get('entity');
    const matchedEntity = requestedEntitySlug ? entityForSlug(requestedEntitySlug) : null;

    setMode(requestedMode, { silent: true });

    if (requestedEntitySlug && hiddenEntity) {
      hiddenEntity.value = requestedEntitySlug;
    }

    localDraftRestored = restoreLocalDraft();
    prefillEntityFields(matchedEntity, localDraftRestored);

    if (matchedEntity && entityNameInput && !String(entityNameInput.value || '').trim()) {
      entityNameInput.value = matchedEntity.name;
    }

    if (!localDraftRestored) {
      setDraftStatus(backendAvailable ? 'Draft not saved yet. Live private sync is available once you begin.' : 'Draft not saved yet.');
    }

    renderConnectionState();
    renderApplicantStatus();
    renderWalletStatus();

    const debouncedDraftSave = debounce(function () {
      saveLocalDraft();
      syncDraft({ loud: false });
    }, 900);

    for (const field of form.querySelectorAll('input, textarea, select')) {
      if (field.type === 'hidden') continue;
      field.addEventListener('input', function () {
        clearInvalidState(field);
        clearFeedback();
        debouncedDraftSave();
      });
      field.addEventListener('change', function () {
        clearInvalidState(field);
        clearFeedback();
        saveLocalDraft();
        syncDraft({ loud: false });
      });
    }

    for (const input of intentOptions) {
      input.addEventListener('change', function () {
        setMode(input.value);
      });
    }

    if (saveDraftButton) {
      saveDraftButton.addEventListener('click', function () {
        saveLocalDraft();
        syncDraft({ force: true, loud: true });
        setFeedback(backendAvailable ? 'Draft saved locally and queued for private sync.' : 'Draft saved on this device.', 'success');
      });
    }

    if (clearDraftButton) {
      clearDraftButton.addEventListener('click', function () {
        clearDraft();
      });
    }

    if (downloadSubmissionButton) {
      downloadSubmissionButton.addEventListener('click', downloadCurrentSubmission);
    }

    if (copySubmissionButton) {
      copySubmissionButton.addEventListener('click', copyCurrentSubmission);
    }

    if (returnToFormButton) {
      returnToFormButton.addEventListener('click', function () {
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    if (caseRefreshButton) {
      caseRefreshButton.addEventListener('click', function () {
        fetchApplicantStatus({ loud: true });
      });
    }

    if (walletChallengeButton) {
      walletChallengeButton.addEventListener('click', createWalletChallenge);
    }

    if (walletVerifyButton) {
      walletVerifyButton.addEventListener('click', verifyWalletTransaction);
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      if (!validateForm()) {
        return;
      }

      const payload = buildSubmissionPayload();

      if (!backendAvailable || !endpoints.submit) {
        showSubmissionState(payload, { posted: false });
        return;
      }

      setFeedback('Submitting intake…', 'info');
      syncDraft({ force: true, loud: true })
        .then(function () {
          const session = readServerSession();
          if (!session || !session.draftToken) {
            throw new Error('Draft sync did not return a usable draft token.');
          }
          return fetchJson(endpoints.submit, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ draftToken: session.draftToken })
          });
        })
        .then(function (response) {
          currentCaseStatus = response;
          if (response && response.caseReference) {
            writeServerSession({ caseReference: response.caseReference });
          }
          renderApplicantStatus();
          renderWalletStatus();
          showSubmissionState(payload, { posted: response.status === 'submitted', backend: response });
        })
        .catch(function (error) {
          showSubmissionState(payload, { posted: false, error: error && error.message ? error.message : 'Submission endpoint unavailable.' });
        });
    });

    Promise.resolve()
      .then(function () {
        return hydrateDraftFromServer();
      })
      .then(function () {
        return fetchApplicantStatus({ loud: false });
      })
      .then(function () {
        return confirmEmailFromQuery();
      });
  }

  setupAutocomplete();
  setupFullListFilters();
  setupListingForm();
})();
