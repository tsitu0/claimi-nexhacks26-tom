/**
 * Claimly Autofill Agent - Advanced Content Script
 * 
 * Implements sophisticated field matching with:
 * 1. Accessible Name Computation (ARIA spec)
 * 2. HTML semantics as dominant signals
 * 3. Enhanced Fuse.js with Extended Search
 * 4. Schema validators (phone, address, numeric)
 * 5. Negative evidence and allow-lists
 * 6. Tiered decision policy (T0-T3)
 * 7. Composite scoring (text + schema + proximity)
 * 8. BM25 ranking for long labels (MiniSearch)
 * 9. Text normalization with synonyms
 * 10. Confidence scoring and review UI
 */

console.log('[Claimi] Advanced Autofill Agent loading...');

// ============================================================================
// GLOBAL STATE
// ============================================================================

let claimPacket = null;
let filledFields = [];
let pendingFields = [];
let lowConfidenceFields = [];
let statusBadge = null;
let fuseIndex = null;
let miniSearchIndex = null;

const CONFIDENCE_THRESHOLD = 0.75; // Fields below this need review

// ============================================================================
// TEXT NORMALIZATION (Requirement #9)
// ============================================================================

const SYNONYMS = {
  'dept': 'department',
  'org': 'organization',
  'addr': 'address',
  'apt': 'apartment',
  'st': 'street',
  'ave': 'avenue',
  'blvd': 'boulevard',
  'num': 'number',
  'no': 'number',
  'tel': 'telephone',
  'ph': 'phone',
  'mob': 'mobile',
  'dob': 'date of birth',
  'fname': 'first name',
  'lname': 'last name',
  'zip': 'postal code',
  'qty': 'quantity',
  'amt': 'amount',
};

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'of', 'at', 'by',
  'for', 'with', 'about', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off',
  'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there',
  'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most',
  'other', 'some', 'such', 'only', 'own', 'same', 'so', 'than', 'too',
  'very', 'just', 'and', 'but', 'if', 'or', 'because', 'as', 'until',
  'while', 'although', 'please', 'enter', 'provide', 'your', 'you', 'i',
  'we', 'they', 'it', 'this', 'that', 'these', 'those',
]);

function normalizeText(text) {
  if (!text) return '';
  
  let normalized = text
    .toLowerCase()
    // Remove diacritics
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    // Split camelCase: "firstName" → "first name"
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // Split snake_case: "first_name" → "first name"
    .replace(/[_-]/g, ' ')
    // Remove punctuation except spaces
    .replace(/[^\w\s]/g, ' ')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
  
  // Apply synonyms
  const words = normalized.split(' ').map(word => SYNONYMS[word] || word);
  
  // Remove stop words for matching (keep original for display)
  const meaningful = words.filter(w => !STOP_WORDS.has(w) && w.length > 1);
  
  return meaningful.join(' ');
}

function normalizeForDisplay(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================================
// FIELD DEFINITIONS WITH POSITIVE/NEGATIVE SIGNALS (Requirement #5)
// ============================================================================

const FIELD_SCHEMAS = {
  firstName: {
    dataType: 'text',
    positiveSignals: {
      autocomplete: ['given-name'],
      keywords: ['first name', 'given name', 'forename', 'legal first name'],
      patterns: [/^first[-_]?name$/i, /^fname$/i, /^given[-_]?name$/i],
    },
    negativeSignals: {
      keywords: ['company', 'business', 'organization', 'department', 'school', 
                 'product', 'store', 'contact person', 'emergency', 'spouse',
                 'parent', 'guardian', 'reference', 'middle'],
      autocomplete: ['organization', 'company-name'],
      types: [],
    },
    validator: (value) => typeof value === 'string' && value.length >= 1 && value.length <= 50,
  },
  
  lastName: {
    dataType: 'text',
    positiveSignals: {
      autocomplete: ['family-name'],
      keywords: ['last name', 'surname', 'family name', 'legal last name'],
      patterns: [/^last[-_]?name$/i, /^lname$/i, /^surname$/i, /^family[-_]?name$/i],
    },
    negativeSignals: {
      keywords: ['company', 'business', 'organization', 'department', 'maiden'],
      autocomplete: ['organization'],
      types: [],
    },
    validator: (value) => typeof value === 'string' && value.length >= 1 && value.length <= 50,
  },
  
  fullName: {
    dataType: 'text',
    positiveSignals: {
      autocomplete: ['name'],
      keywords: ['full name', 'your name', 'claimant name', 'legal name', 'print name'],
      patterns: [/^full[-_]?name$/i, /^name$/i, /^your[-_]?name$/i],
    },
    negativeSignals: {
      keywords: ['company', 'business', 'organization', 'department', 'school',
                 'university', 'product', 'store', 'brand', 'model', 'file',
                 'project', 'event', 'account', 'user', 'employer', 'institution'],
      autocomplete: ['organization', 'company-name'],
      types: ['email', 'tel', 'number'],
    },
    validator: (value) => typeof value === 'string' && value.length >= 2 && value.length <= 100,
  },
  
  email: {
    dataType: 'email',
    positiveSignals: {
      autocomplete: ['email'],
      keywords: ['email address', 'e-mail', 'your email', 'email', 
                 'confirm email address', 'confirm your email', 'confirm email',
                 'verify email address', 'verify your email', 'verify email'],
      patterns: [/^e?-?mail$/i, /^email[-_]?addr/i, /^confirm[-_]?email$/i, /^verify[-_]?email$/i],
      types: ['email'],
    },
    negativeSignals: {
      // Only block generic "repeat/re-enter" - allow confirm/verify for email
      keywords: ['repeat', 're-enter', 'retype', 'type again'],
      autocomplete: [],
      types: [],
    },
    validator: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  },
  
  phone: {
    dataType: 'phone',
    positiveSignals: {
      autocomplete: ['tel', 'tel-national', 'tel-local'],
      keywords: ['phone number', 'telephone number', 'mobile number', 'cell phone', 
                 'phone', 'telephone', 'mobile phone', 'contact phone', 'daytime phone',
                 'primary phone', 'home phone number', 'cell number'],
      patterns: [/^phone$/i, /^tel$/i, /^telephone$/i, /^mobile$/i, 
                 /^phone[-_]?number$/i, /^phone[-_]?num$/i, /^cell$/i,
                 /^contact[-_]?phone$/i, /^primary[-_]?phone$/i],
      types: ['tel'],
    },
    negativeSignals: {
      keywords: ['how many', 'number of', 'count', 'quantity', 'students', 
                 'attendees', 'participants', 'items', 'extension', 'fax',
                 'order number', 'confirmation number', 'reference number'],
      autocomplete: [],
      types: ['number'],
      inputmodes: ['numeric'],
      // If has min/max constraints suggesting count, reject
      hasMinMax: true,
    },
    validator: (value) => {
      const phoneStr = String(value);
      console.log('[Claimly] Phone validator called with:', phoneStr);
      
      // Check if libphonenumber is available and has the function
      if (typeof libphonenumber !== 'undefined' && typeof libphonenumber.isValidPhoneNumber === 'function') {
        try {
          const result = libphonenumber.isValidPhoneNumber(phoneStr, 'US');
          console.log('[Claimly] libphonenumber result:', result);
          return result;
        } catch (e) {
          console.log('[Claimly] libphonenumber error:', e.message);
          // Fall through to basic check
        }
      } else {
        console.log('[Claimly] libphonenumber not available, using basic check');
      }
      
      // Fallback: basic digit check
      const digits = phoneStr.replace(/\D/g, '');
      const isValid = digits.length >= 7 && digits.length <= 15;
      console.log('[Claimly] Basic check - digits:', digits.length, 'valid:', isValid);
      return isValid;
    },
  },
  
  'address.street': {
    dataType: 'text',
    positiveSignals: {
      autocomplete: ['street-address', 'address-line1'],
      keywords: ['street address', 'mailing address', 'home address', 'address line 1'],
      patterns: [/^street$/i, /^address[-_]?1$/i, /^addr1$/i],
    },
    negativeSignals: {
      keywords: ['email', 'web', 'url', 'ip address', 'billing', 'work'],
      autocomplete: ['email'],
      types: ['email'],
    },
    validator: (value) => typeof value === 'string' && value.length >= 3,
  },
  
  'address.unit': {
    dataType: 'text',
    positiveSignals: {
      autocomplete: ['address-line2'],
      keywords: ['apartment', 'apt number', 'unit number', 'suite', 'floor'],
      patterns: [/^apt$/i, /^unit$/i, /^suite$/i, /^address[-_]?2$/i],
    },
    negativeSignals: { keywords: [], autocomplete: [], types: [] },
    validator: (value) => typeof value === 'string',
  },
  
  'address.city': {
    dataType: 'text',
    positiveSignals: {
      autocomplete: ['address-level2'],
      keywords: ['city', 'city name', 'town'],
      patterns: [/^city$/i, /^town$/i],
    },
    negativeSignals: {
      keywords: ['birth', 'work', 'employer'],
      autocomplete: [],
      types: [],
    },
    validator: (value) => typeof value === 'string' && value.length >= 2,
  },
  
  'address.state': {
    dataType: 'text',
    positiveSignals: {
      autocomplete: ['address-level1'],
      keywords: ['state', 'province', 'region'],
      patterns: [/^state$/i, /^province$/i, /^region$/i],
    },
    negativeSignals: {
      keywords: ['country', 'birth'],
      autocomplete: [],
      types: [],
    },
    validator: (value) => typeof value === 'string' && value.length >= 2,
  },
  
  'address.zip': {
    dataType: 'text',
    positiveSignals: {
      autocomplete: ['postal-code'],
      keywords: ['zip code', 'postal code', 'zipcode', 'postcode'],
      patterns: [/^zip$/i, /^zip[-_]?code$/i, /^postal[-_]?code$/i],
    },
    negativeSignals: { keywords: [], autocomplete: [], types: [] },
    validator: (value) => {
      const str = String(value);
      // US ZIP: 5 digits or 5+4
      return /^\d{5}(-\d{4})?$/.test(str) || str.length >= 3;
    },
  },
  
  'address.country': {
    dataType: 'text',
    positiveSignals: {
      autocomplete: ['country', 'country-name'],
      keywords: ['country', 'nation'],
      patterns: [/^country$/i],
    },
    negativeSignals: {
      keywords: ['birth', 'citizenship'],
      autocomplete: [],
      types: [],
    },
    validator: (value) => typeof value === 'string' && value.length >= 2,
  },
  
  dateOfBirth: {
    dataType: 'date',
    positiveSignals: {
      autocomplete: ['bday'],
      keywords: ['date of birth', 'birth date', 'birthday', 'dob'],
      patterns: [/^dob$/i, /^birth[-_]?date$/i],
      types: ['date'],
    },
    negativeSignals: {
      keywords: ['purchase', 'order', 'event', 'incident', 'transaction'],
      autocomplete: [],
      types: [],
    },
    validator: (value) => {
      const date = new Date(value);
      return !isNaN(date) && date < new Date();
    },
  },
  
  purchaseDate: {
    dataType: 'date',
    positiveSignals: {
      autocomplete: [],
      keywords: ['purchase date', 'date of purchase', 'order date', 'transaction date'],
      patterns: [/^purchase[-_]?date$/i],
      types: ['date'],
    },
    negativeSignals: {
      keywords: ['birth'],
      autocomplete: ['bday'],
      types: [],
    },
    validator: (value) => !isNaN(new Date(value)),
  },
  
  productName: {
    dataType: 'text',
    positiveSignals: {
      autocomplete: [],
      keywords: ['product name', 'item name', 'product purchased'],
      patterns: [/^product[-_]?name$/i, /^item[-_]?name$/i],
    },
    negativeSignals: {
      keywords: ['your name', 'first name', 'last name', 'full name'],
      autocomplete: ['name', 'given-name', 'family-name'],
      types: [],
    },
    validator: (value) => typeof value === 'string' && value.length >= 1,
  },
  
  productModel: {
    dataType: 'text',
    positiveSignals: {
      autocomplete: [],
      keywords: ['model number', 'product model', 'model name'],
      patterns: [/^model$/i, /^model[-_]?num/i],
    },
    negativeSignals: { keywords: [], autocomplete: [], types: [] },
    validator: (value) => typeof value === 'string',
  },
  
  serialNumber: {
    dataType: 'text',
    positiveSignals: {
      autocomplete: [],
      keywords: ['serial number', 'serial no'],
      patterns: [/^serial$/i, /^serial[-_]?num/i],
    },
    negativeSignals: {
      keywords: ['social security'],
      autocomplete: [],
      types: [],
    },
    validator: (value) => typeof value === 'string',
  },
  
  purchaseAmount: {
    dataType: 'number',
    positiveSignals: {
      autocomplete: [],
      keywords: ['purchase amount', 'amount paid', 'total paid', 'price paid'],
      patterns: [/^amount$/i, /^price$/i, /^total$/i],
      types: ['number'],
      inputmodes: ['decimal', 'numeric'],
    },
    negativeSignals: {
      keywords: ['how many', 'number of', 'count', 'quantity', 'students'],
      autocomplete: [],
      types: [],
    },
    validator: (value) => !isNaN(parseFloat(value)) && parseFloat(value) >= 0,
  },
  
  storeName: {
    dataType: 'text',
    positiveSignals: {
      autocomplete: [],
      keywords: ['store name', 'retailer', 'merchant', 'where purchased'],
      patterns: [/^store$/i, /^retailer$/i, /^merchant$/i],
    },
    negativeSignals: {
      keywords: ['your name', 'first name', 'last name'],
      autocomplete: ['name', 'given-name', 'family-name'],
      types: [],
    },
    validator: (value) => typeof value === 'string' && value.length >= 1,
  },
};

// ============================================================================
// ACCESSIBLE NAME COMPUTATION (Requirement #1)
// Following W3C ARIA spec precedence
// ============================================================================

function computeAccessibleName(field) {
  // Priority 1: aria-labelledby
  const labelledBy = field.getAttribute('aria-labelledby');
  if (labelledBy) {
    const names = labelledBy.split(' ')
      .map(id => document.getElementById(id)?.textContent?.trim())
      .filter(Boolean);
    if (names.length > 0) {
      return { text: names.join(' '), source: 'aria-labelledby' };
    }
  }
  
  // Priority 2: aria-label
  const ariaLabel = field.getAttribute('aria-label');
  if (ariaLabel) {
    return { text: ariaLabel.trim(), source: 'aria-label' };
  }
  
  // Priority 3: Native label (for attribute or wrapping)
  if (field.id) {
    const label = document.querySelector(`label[for="${CSS.escape(field.id)}"]`);
    if (label) {
      return { text: label.textContent.trim(), source: 'label-for' };
    }
  }
  
  const wrappingLabel = field.closest('label');
  if (wrappingLabel) {
    const clone = wrappingLabel.cloneNode(true);
    clone.querySelectorAll('input, select, textarea, button').forEach(el => el.remove());
    const text = clone.textContent.trim();
    if (text) {
      return { text, source: 'label-wrap' };
    }
  }
  
  // Priority 4: Fieldset legend
  const fieldset = field.closest('fieldset');
  if (fieldset) {
    const legend = fieldset.querySelector('legend');
    if (legend) {
      return { text: legend.textContent.trim(), source: 'legend' };
    }
  }
  
  // Priority 5: Placeholder
  if (field.placeholder) {
    return { text: field.placeholder.trim(), source: 'placeholder' };
  }
  
  // Priority 6: title attribute
  if (field.title) {
    return { text: field.title.trim(), source: 'title' };
  }
  
  // Fallback: nearby text
  const prev = field.previousElementSibling;
  if (prev && ['LABEL', 'SPAN', 'DIV'].includes(prev.tagName)) {
    const text = prev.textContent.trim();
    if (text && text.length < 100) {
      return { text, source: 'sibling' };
    }
  }
  
  return { text: '', source: 'none' };
}

function getDescriptionText(field) {
  const descriptions = [];
  
  // aria-describedby
  const describedBy = field.getAttribute('aria-describedby');
  if (describedBy) {
    describedBy.split(' ').forEach(id => {
      const el = document.getElementById(id);
      if (el) descriptions.push(el.textContent.trim());
    });
  }
  
  // Nearby hint elements
  const parent = field.parentElement;
  if (parent) {
    parent.querySelectorAll('.hint, .help-text, .description, .note, small, .form-text, .helper-text').forEach(el => {
      if (!el.contains(field)) {
        descriptions.push(el.textContent.trim());
      }
    });
  }
  
  return descriptions.join(' ');
}

// ============================================================================
// HTML SEMANTICS EXTRACTION (Requirement #2)
// ============================================================================

function extractSemantics(field) {
  return {
    type: field.type || 'text',
    autocomplete: field.getAttribute('autocomplete') || '',
    inputmode: field.getAttribute('inputmode') || '',
    pattern: field.getAttribute('pattern') || '',
    min: field.getAttribute('min'),
    max: field.getAttribute('max'),
    step: field.getAttribute('step'),
    required: field.required || field.getAttribute('aria-required') === 'true',
    name: field.name || '',
    id: field.id || '',
  };
}

// ============================================================================
// SEARCH INDEX INITIALIZATION (Requirements #3 and #8)
// ============================================================================

function initializeSearchIndices() {
  // Fuse.js with Extended Search
  if (typeof Fuse !== 'undefined') {
    const fuseItems = [];
    
    for (const [key, schema] of Object.entries(FIELD_SCHEMAS)) {
      for (const keyword of schema.positiveSignals.keywords) {
        fuseItems.push({
          key,
          term: normalizeText(keyword),
          original: keyword,
          weight: 1.0,
        });
      }
    }
    
    fuseIndex = new Fuse(fuseItems, {
      keys: [{ name: 'term', weight: 0.7 }, { name: 'original', weight: 0.3 }],
      threshold: 0.25,
      includeScore: true,
      minMatchCharLength: 2,
      ignoreLocation: true,
      useExtendedSearch: true,
    });
    
    console.log(`[Claimly] Fuse.js initialized with ${fuseItems.length} terms`);
  }
  
  // MiniSearch for BM25 ranking on long text
  if (typeof MiniSearch !== 'undefined') {
    miniSearchIndex = new MiniSearch({
      fields: ['text'],
      storeFields: ['key', 'text'],
      searchOptions: {
        boost: { text: 2 },
        fuzzy: 0.2,
        prefix: true,
      },
    });
    
    let docId = 0;
    for (const [key, schema] of Object.entries(FIELD_SCHEMAS)) {
      for (const keyword of schema.positiveSignals.keywords) {
        miniSearchIndex.add({
          id: docId++,
          key,
          text: normalizeText(keyword),
        });
      }
    }
    
    console.log(`[Claimly] MiniSearch initialized with ${docId} documents`);
  }
}

// ============================================================================
// SCORING SYSTEM (Requirement #7)
// 70% text similarity + 20% schema bonus + 10% DOM proximity
// ============================================================================

function calculateCompositeScore(textScore, schemaBonus, proximityScore) {
  return (textScore * 0.7) + (schemaBonus * 0.2) + (proximityScore * 0.1);
}

function getSchemaBonus(fieldKey, semantics, accessibleName) {
  const schema = FIELD_SCHEMAS[fieldKey];
  if (!schema) return 0;
  
  let bonus = 0;
  
  // Autocomplete match: +0.5
  if (schema.positiveSignals.autocomplete.includes(semantics.autocomplete)) {
    bonus += 0.5;
  }
  
  // Type match: +0.3
  if (schema.positiveSignals.types?.includes(semantics.type)) {
    bonus += 0.3;
  }
  
  // Pattern match on id/name: +0.2
  for (const pattern of schema.positiveSignals.patterns || []) {
    if (pattern.test(semantics.id) || pattern.test(semantics.name)) {
      bonus += 0.2;
      break;
    }
  }
  
  return Math.min(bonus, 1.0);
}

function getDOMProximityScore(field) {
  // Fields closer to the top of the form get slightly higher scores
  // This helps with typical form layouts
  const rect = field.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  
  // Normalize: top of page = 1.0, bottom = 0.5
  return 1.0 - (rect.top / viewportHeight) * 0.5;
}

// ============================================================================
// NEGATIVE EVIDENCE CHECKING (Requirement #5)
// ============================================================================

function hasNegativeEvidence(fieldKey, semantics, labelText, descriptionText) {
  const schema = FIELD_SCHEMAS[fieldKey];
  if (!schema) return false;
  
  const neg = schema.negativeSignals;
  const fullText = `${labelText} ${descriptionText}`.toLowerCase();
  
  // Check negative keywords
  for (const keyword of neg.keywords || []) {
    if (fullText.includes(keyword.toLowerCase())) {
      console.log(`[Claimly]     ⛔ Negative keyword: "${keyword}"`);
      return true;
    }
  }
  
  // Check negative autocomplete
  if (neg.autocomplete?.includes(semantics.autocomplete)) {
    console.log(`[Claimly]     ⛔ Negative autocomplete: "${semantics.autocomplete}"`);
    return true;
  }
  
  // Check negative types
  if (neg.types?.includes(semantics.type)) {
    console.log(`[Claimly]     ⛔ Negative type: "${semantics.type}"`);
    return true;
  }
  
  // Check inputmode
  if (neg.inputmodes?.includes(semantics.inputmode)) {
    console.log(`[Claimly]     ⛔ Negative inputmode: "${semantics.inputmode}"`);
    return true;
  }
  
  // Special: phone fields should not match numeric count fields
  if (fieldKey === 'phone' && neg.hasMinMax) {
    if (semantics.min !== null || semantics.max !== null) {
      if (parseFloat(semantics.max) < 100) { // Likely a count field
        console.log(`[Claimly]     ⛔ Has min/max suggesting count field`);
        return true;
      }
    }
  }
  
  return false;
}

// ============================================================================
// TIERED DECISION POLICY (Requirement #6)
// ============================================================================

function matchFieldTiered(field) {
  const semantics = extractSemantics(field);
  const { text: labelText, source: labelSource } = computeAccessibleName(field);
  const descriptionText = getDescriptionText(field);
  const normalizedLabel = normalizeText(labelText);
  const fullContext = `${labelText} ${descriptionText}`;
  
  console.log('[Claimly] 🔍 Field:', {
    id: semantics.id,
    name: semantics.name,
    type: semantics.type,
    autocomplete: semantics.autocomplete,
    label: labelText.substring(0, 50),
    labelSource,
  });
  
  // Skip question-like fields
  if (isQuestionField(fullContext)) {
    console.log('[Claimly]   ⏭️ Skipped: question field');
    return null;
  }
  
  let bestMatch = null;
  let bestScore = 0;
  let bestTier = -1;
  
  // TIER 0: Deterministic matches (type + autocomplete exact)
  for (const [key, schema] of Object.entries(FIELD_SCHEMAS)) {
    // Check autocomplete
    if (schema.positiveSignals.autocomplete.includes(semantics.autocomplete)) {
      if (!hasNegativeEvidence(key, semantics, labelText, descriptionText)) {
        const score = 1.0;
        console.log(`[Claimly]   ✅ T0: autocomplete="${semantics.autocomplete}" → ${key} (${score.toFixed(2)})`);
        return { key, tier: 0, confidence: score };
      }
    }
    
    // Check type (email, tel only)
    if (schema.positiveSignals.types?.includes(semantics.type)) {
      if (!hasNegativeEvidence(key, semantics, labelText, descriptionText)) {
        const score = 0.95;
        if (score > bestScore) {
          bestMatch = key;
          bestScore = score;
          bestTier = 0;
        }
      }
    }
  }
  
  if (bestTier === 0 && bestScore >= 0.9) {
    console.log(`[Claimly]   ✅ T0: type="${semantics.type}" → ${bestMatch} (${bestScore.toFixed(2)})`);
    return { key: bestMatch, tier: 0, confidence: bestScore };
  }
  
  // TIER 1: Exact pattern matches on id/name
  for (const [key, schema] of Object.entries(FIELD_SCHEMAS)) {
    for (const pattern of schema.positiveSignals.patterns || []) {
      if (pattern.test(semantics.id) || pattern.test(semantics.name)) {
        if (!hasNegativeEvidence(key, semantics, labelText, descriptionText)) {
          const schemaBonus = getSchemaBonus(key, semantics, labelText);
          const score = calculateCompositeScore(0.9, schemaBonus, getDOMProximityScore(field));
          
          if (score > bestScore) {
            bestMatch = key;
            bestScore = score;
            bestTier = 1;
          }
        }
      }
    }
  }
  
  if (bestTier === 1 && bestScore >= 0.8) {
    console.log(`[Claimly]   ✅ T1: pattern match → ${bestMatch} (${bestScore.toFixed(2)})`);
    return { key: bestMatch, tier: 1, confidence: bestScore };
  }
  
  // TIER 1.5: Hardcoded exact label matches (high confidence for common fields)
  const exactLabelMatches = {
    'phone number': 'phone',
    'phone': 'phone',
    'telephone': 'phone',
    'telephone number': 'phone',
    'mobile number': 'phone',
    'mobile phone': 'phone',
    'cell phone': 'phone',
    'cell phone number': 'phone',
    'contact phone': 'phone',
    'daytime phone': 'phone',
    'email': 'email',
    'email address': 'email',
    'e-mail': 'email',
    'e-mail address': 'email',
    'your email': 'email',
    'confirm email': 'email',
    'confirm email address': 'email',
    'confirm your email': 'email',
    'verify email': 'email',
    'verify email address': 'email',
    'first name': 'firstName',
    'last name': 'lastName',
    'full name': 'fullName',
    'your name': 'fullName',
    'name': 'fullName',
    'street address': 'address.street',
    'mailing address': 'address.street',
    'address': 'address.street',
    'city': 'address.city',
    'state': 'address.state',
    'zip code': 'address.zip',
    'postal code': 'address.zip',
    'zip': 'address.zip',
    'country': 'address.country',
  };
  
  const labelLower = normalizeForDisplay(labelText);
  if (exactLabelMatches[labelLower]) {
    const key = exactLabelMatches[labelLower];
    if (!hasNegativeEvidence(key, semantics, labelText, descriptionText)) {
      const score = 0.9;
      console.log(`[Claimly]   ✅ T1.5: exact label "${labelLower}" → ${key} (${score.toFixed(2)})`);
      return { key, tier: 1.5, confidence: score };
    }
  }
  
  // TIER 2: Fuzzy matching with strict threshold
  if (fuseIndex && normalizedLabel.length >= 3) {
    // Use extended search syntax for exact prefix matching first
    const exactResults = fuseIndex.search(`^${normalizedLabel}`);
    const fuzzyResults = fuseIndex.search(normalizedLabel);
    
    const allResults = [...exactResults, ...fuzzyResults];
    
    for (const result of allResults.slice(0, 5)) {
      const key = result.item.key;
      
      if (hasNegativeEvidence(key, semantics, labelText, descriptionText)) {
        continue;
      }
      
      const textScore = 1 - (result.score || 0);
      const schemaBonus = getSchemaBonus(key, semantics, labelText);
      const score = calculateCompositeScore(textScore, schemaBonus, getDOMProximityScore(field));
      
      if (score > bestScore && score >= 0.6) {
        bestMatch = key;
        bestScore = score;
        bestTier = 2;
      }
    }
  }
  
  // TIER 2b: MiniSearch for longer labels
  if (miniSearchIndex && normalizedLabel.length >= 10) {
    const results = miniSearchIndex.search(normalizedLabel);
    
    for (const result of results.slice(0, 3)) {
      const key = result.key;
      
      if (hasNegativeEvidence(key, semantics, labelText, descriptionText)) {
        continue;
      }
      
      // MiniSearch scores are higher = better
      const textScore = Math.min(result.score / 10, 1);
      const schemaBonus = getSchemaBonus(key, semantics, labelText);
      const score = calculateCompositeScore(textScore, schemaBonus, getDOMProximityScore(field));
      
      if (score > bestScore && score >= 0.6) {
        bestMatch = key;
        bestScore = score;
        bestTier = 2;
      }
    }
  }
  
  if (bestTier === 2 && bestScore >= 0.6) {
    console.log(`[Claimly]   ✅ T2: fuzzy match → ${bestMatch} (${bestScore.toFixed(2)})`);
    return { key: bestMatch, tier: 2, confidence: bestScore };
  }
  
  // TIER 3: Keyword fallback with VERY strict rules
  // Only for very simple, clear cases
  if (normalizedLabel.length >= 3) {
    for (const [key, schema] of Object.entries(FIELD_SCHEMAS)) {
      for (const keyword of schema.positiveSignals.keywords) {
        const normalizedKeyword = normalizeText(keyword);
        
        // Require near-exact match
        if (normalizedLabel === normalizedKeyword || 
            normalizedLabel.startsWith(normalizedKeyword + ' ') ||
            normalizedLabel.endsWith(' ' + normalizedKeyword)) {
          
          if (!hasNegativeEvidence(key, semantics, labelText, descriptionText)) {
            const score = 0.55;
            if (score > bestScore) {
              bestMatch = key;
              bestScore = score;
              bestTier = 3;
            }
          }
        }
      }
    }
  }
  
  if (bestTier === 3 && bestScore >= 0.5) {
    console.log(`[Claimly]   ⚠️ T3: keyword fallback → ${bestMatch} (${bestScore.toFixed(2)})`);
    return { key: bestMatch, tier: 3, confidence: bestScore };
  }
  
  console.log('[Claimly]   ❌ No match');
  return null;
}

function isQuestionField(text) {
  const lower = text.toLowerCase();
  const patterns = [
    /how many/i,
    /number of (?!phone|telephone)/i,
    /count of/i,
    /quantity/i,
    /please describe/i,
    /please explain/i,
    /tell us about/i,
    /\?$/,
    /select all/i,
    /choose/i,
    /which of/i,
    /have you ever/i,
    /do you have/i,
    /did you/i,
    /are you/i,
    /were you/i,
    /why did/i,
    /when did you/i,
  ];
  
  return patterns.some(p => p.test(lower));
}

// ============================================================================
// VALIDATION (Requirement #4)
// ============================================================================

function validateAndFill(field, value, fieldKey) {
  const schema = FIELD_SCHEMAS[fieldKey];
  if (!schema) return false;
  
  // Run validator
  if (schema.validator && !schema.validator(value)) {
    console.log(`[Claimly]   ⛔ Validation failed for ${fieldKey}`);
    return false;
  }
  
  const str = String(value);
  
  try {
    if (field.tagName === 'SELECT') {
      const opts = Array.from(field.options);
      const lower = str.toLowerCase();
      const match = opts.find(o => 
        o.value.toLowerCase() === lower || 
        o.textContent.toLowerCase().trim() === lower
      );
      if (match) field.value = match.value;
      else return false;
    } else if (field.type === 'checkbox') {
      field.checked = ['true', '1', 'yes'].includes(str.toLowerCase()) || value === true;
    } else if (field.type === 'radio') {
      if (field.value.toLowerCase() !== str.toLowerCase()) return false;
      field.checked = true;
    } else if (field.type === 'date') {
      try {
        const d = new Date(str);
        field.value = isNaN(d) ? str : d.toISOString().split('T')[0];
      } catch { field.value = str; }
    } else {
      field.value = str;
    }
    
    // Trigger events
    const proto = {
      'TEXTAREA': HTMLTextAreaElement.prototype,
      'SELECT': HTMLSelectElement.prototype,
    }[field.tagName] || HTMLInputElement.prototype;
    
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(field, field.value);
    
    ['focus', 'input', 'change', 'blur'].forEach(e => 
      field.dispatchEvent(new Event(e, { bubbles: true }))
    );
    
    return true;
  } catch (err) {
    console.error('[Claimly]   ❌ Fill error:', err);
    return false;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getNestedValue(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

function getFormFields() {
  const selectors = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]):not([type="file"]), select, textarea';
  return Array.from(document.querySelectorAll(selectors)).filter(f => {
    const style = getComputedStyle(f);
    const rect = f.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  });
}

// ============================================================================
// MAIN AUTOFILL FUNCTION
// ============================================================================

async function autofillForm(packet) {
  console.log('[Claimly] ══════════════════════════════════════════');
  console.log('[Claimly] 🚀 Advanced Autofill Starting');
  console.log('[Claimly] Data keys:', Object.keys(packet.userData || {}));
  
  claimPacket = packet;
  filledFields = [];
  pendingFields = [];
  lowConfidenceFields = [];
  
  const fields = getFormFields();
  console.log(`[Claimly] Found ${fields.length} fields`);
  console.log('[Claimly] ──────────────────────────────────────────');
  
  for (const field of fields) {
    const match = matchFieldTiered(field);
    
    if (match) {
      const value = getNestedValue(packet.userData, match.key);
      
      if (value != null && value !== '') {
        if (validateAndFill(field, value, match.key)) {
          field.classList.add('claimly-filled');
          
          const record = { 
            field, 
            key: match.key, 
            value, 
            tier: match.tier, 
            confidence: match.confidence 
          };
          
          filledFields.push(record);
          
          // Track low confidence for review
          if (match.confidence < CONFIDENCE_THRESHOLD) {
            lowConfidenceFields.push(record);
            field.classList.add('claimly-low-confidence');
          }
          
          console.log(`[Claimly]   ✅ Filled: ${match.key} (confidence: ${match.confidence.toFixed(2)})`);
        } else {
          pendingFields.push({ field, key: match.key, reason: 'validation_failed' });
          field.classList.add('claimly-needs-attention');
        }
      } else {
        pendingFields.push({ field, key: match.key, reason: 'no_value' });
        field.classList.add('claimly-needs-attention');
      }
    } else if (field.required || field.getAttribute('aria-required') === 'true') {
      pendingFields.push({ field, key: null, reason: 'no_match' });
      field.classList.add('claimly-needs-attention');
    }
    
    console.log('[Claimly] ──────────────────────────────────────────');
  }
  
  console.log('[Claimly] ══════════════════════════════════════════');
  console.log(`[Claimly] ✅ Done!`);
  console.log(`[Claimly]    Filled: ${filledFields.length}`);
  console.log(`[Claimly]    Low confidence: ${lowConfidenceFields.length}`);
  console.log(`[Claimly]    Pending: ${pendingFields.length}`);
  
  showStatusBadge();
  
  return { 
    filled: filledFields.length, 
    pending: pendingFields.length,
    lowConfidence: lowConfidenceFields.length,
  };
}

// ============================================================================
// UI (Requirement #10)
// ============================================================================

function showStatusBadge() {
  statusBadge?.remove();
  
  const hasLowConfidence = lowConfidenceFields.length > 0;
  
  statusBadge = document.createElement('div');
  statusBadge.className = 'claimly-badge';
  statusBadge.innerHTML = `
    <button class="claimly-btn-close" id="claimly-close">×</button>
    <div class="claimly-badge-header">
      <div class="claimly-badge-logo">C</div>
      <span>Claimly</span>
    </div>
    <div class="claimly-badge-stats">
      <span class="claimly-stat claimly-stat-filled">✅ ${filledFields.length} filled</span>
      ${hasLowConfidence ? `<span class="claimly-stat claimly-stat-warning">⚠️ ${lowConfidenceFields.length} uncertain</span>` : ''}
      ${pendingFields.length > 0 ? `<span class="claimly-stat claimly-stat-pending">❓ ${pendingFields.length} skipped</span>` : ''}
    </div>
    <div class="claimly-badge-actions">
      <button class="claimly-btn claimly-btn-secondary" id="claimly-clear">Clear</button>
      ${hasLowConfidence ? `<button class="claimly-btn claimly-btn-warning" id="claimly-review-uncertain">Review Uncertain</button>` : ''}
      ${pendingFields.length > 0 ? `<button class="claimly-btn claimly-btn-primary" id="claimly-review">Review Skipped</button>` : ''}
    </div>
  `;
  
  document.body.appendChild(statusBadge);
  
  document.getElementById('claimly-close')?.addEventListener('click', () => { 
    statusBadge?.remove(); 
    statusBadge = null; 
  });
  document.getElementById('claimly-clear')?.addEventListener('click', clearAutofill);
  document.getElementById('claimly-review')?.addEventListener('click', () => {
    pendingFields[0]?.field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    pendingFields[0]?.field?.focus();
  });
  document.getElementById('claimly-review-uncertain')?.addEventListener('click', () => {
    lowConfidenceFields[0]?.field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    lowConfidenceFields[0]?.field?.focus();
    showFieldConfidence(lowConfidenceFields[0]);
  });
}

function showFieldConfidence(record) {
  if (!record) return;
  
  // Remove existing tooltip
  document.querySelector('.claimly-confidence-tooltip')?.remove();
  
  const tooltip = document.createElement('div');
  tooltip.className = 'claimly-confidence-tooltip';
  tooltip.innerHTML = `
    <div class="claimly-tooltip-header">Uncertain Match</div>
    <div class="claimly-tooltip-body">
      <div>Field: <strong>${record.key}</strong></div>
      <div>Value: <strong>${String(record.value).substring(0, 30)}</strong></div>
      <div>Confidence: <strong>${(record.confidence * 100).toFixed(0)}%</strong></div>
      <div>Tier: <strong>${record.tier}</strong></div>
    </div>
    <div class="claimly-tooltip-actions">
      <button class="claimly-btn claimly-btn-sm" id="claimly-accept">Accept</button>
      <button class="claimly-btn claimly-btn-sm claimly-btn-danger" id="claimly-reject">Clear</button>
    </div>
  `;
  
  const rect = record.field.getBoundingClientRect();
  tooltip.style.position = 'fixed';
  tooltip.style.top = `${rect.bottom + 8}px`;
  tooltip.style.left = `${rect.left}px`;
  tooltip.style.zIndex = '999999';
  
  document.body.appendChild(tooltip);
  
  document.getElementById('claimly-accept')?.addEventListener('click', () => {
    record.field.classList.remove('claimly-low-confidence');
    tooltip.remove();
    const idx = lowConfidenceFields.indexOf(record);
    if (idx > -1) lowConfidenceFields.splice(idx, 1);
    if (lowConfidenceFields.length > 0) {
      showFieldConfidence(lowConfidenceFields[0]);
    }
  });
  
  document.getElementById('claimly-reject')?.addEventListener('click', () => {
    record.field.value = '';
    record.field.classList.remove('claimly-filled', 'claimly-low-confidence');
    record.field.dispatchEvent(new Event('input', { bubbles: true }));
    tooltip.remove();
    const idx = lowConfidenceFields.indexOf(record);
    if (idx > -1) lowConfidenceFields.splice(idx, 1);
    const filledIdx = filledFields.indexOf(record);
    if (filledIdx > -1) filledFields.splice(filledIdx, 1);
    if (lowConfidenceFields.length > 0) {
      showFieldConfidence(lowConfidenceFields[0]);
    }
  });
}

function clearAutofill() {
  filledFields.forEach(({ field }) => {
    field.value = '';
    field.classList.remove('claimly-filled', 'claimly-low-confidence');
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  pendingFields.forEach(({ field }) => field?.classList.remove('claimly-needs-attention'));
  
  filledFields = [];
  pendingFields = [];
  lowConfidenceFields = [];
  
  document.querySelector('.claimly-confidence-tooltip')?.remove();
  statusBadge?.remove();
  statusBadge = null;
}

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('[Claimly] Message:', msg.action);
  
  if (msg.action === 'autofill') {
    autofillForm(msg.claimPacket)
      .then(sendResponse)
      .catch(e => {
        console.error('[Claimly] Error:', e);
        sendResponse({ error: e.message, filled: 0, pending: 0, lowConfidence: 0 });
      });
    return true;
  }
  
  if (msg.action === 'clear') {
    clearAutofill();
    sendResponse({ success: true });
  }
  
  if (msg.action === 'getStatus') {
    sendResponse({ 
      filled: filledFields.length, 
      pending: pendingFields.length,
      lowConfidence: lowConfidenceFields.length,
      hasClaimPacket: !!claimPacket,
    });
  }
  
  if (msg.action === 'detectFields') {
    const fields = getFormFields();
    sendResponse({
      count: fields.length,
      fields: fields.map(f => {
        const { text } = computeAccessibleName(f);
        return {
          id: f.id,
          name: f.name,
          type: f.type,
          label: text.substring(0, 60),
          required: f.required,
        };
      }),
    });
  }
  
  return false;
});

// ============================================================================
// INITIALIZATION
// ============================================================================

initializeSearchIndices();
console.log('[Claimly] ✅ Advanced Autofill Agent ready!');
