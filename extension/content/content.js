/**
 * Claimly Autofill Agent - Content Script
 * 
 * Tiered approach:
 * - Tier 1 (Direct): Match by ID, Name, Autocomplete attributes
 * - Tier 2 (Fuzzy): Use Fuse.js to match labels to JSON keys
 * - Tier 3 (Agentic): LLM-based mapping for complex fields
 */

// Global state
let claimPacket = null;
let filledFields = [];
let pendingFields = [];
let statusBadge = null;

// Field mapping configurations for Tier 1
const DIRECT_MAPPINGS = {
  // Standard autocomplete values -> claim packet keys
  autocomplete: {
    'given-name': 'firstName',
    'family-name': 'lastName',
    'name': 'fullName',
    'email': 'email',
    'tel': 'phone',
    'street-address': 'address.street',
    'address-line1': 'address.street',
    'address-line2': 'address.unit',
    'address-level2': 'address.city',
    'address-level1': 'address.state',
    'postal-code': 'address.zip',
    'country': 'address.country',
    'bday': 'dateOfBirth',
    'bday-day': 'dateOfBirth.day',
    'bday-month': 'dateOfBirth.month',
    'bday-year': 'dateOfBirth.year',
  },
  // Common ID/name patterns -> claim packet keys
  patterns: {
    'first[-_]?name|fname|given[-_]?name': 'firstName',
    'last[-_]?name|lname|surname|family[-_]?name': 'lastName',
    'full[-_]?name|name': 'fullName',
    'e[-_]?mail': 'email',
    'phone|tel|mobile': 'phone',
    'street|address[-_]?1|addr1': 'address.street',
    'apt|unit|suite|address[-_]?2|addr2': 'address.unit',
    'city': 'address.city',
    'state|province|region': 'address.state',
    'zip|postal[-_]?code|postcode': 'address.zip',
    'country': 'address.country',
    'dob|birth[-_]?date|date[-_]?of[-_]?birth': 'dateOfBirth',
    'ssn|social[-_]?security': 'ssn',
    'purchase[-_]?date|date[-_]?of[-_]?purchase': 'purchaseDate',
    'product[-_]?name|item[-_]?name': 'productName',
    'model|product[-_]?model': 'productModel',
    'serial|serial[-_]?number': 'serialNumber',
    'receipt|proof': 'receiptNumber',
    'amount|price|cost': 'purchaseAmount',
    'store|retailer|merchant': 'storeName',
  }
};

// Fuzzy matching configuration for Tier 2
const FUZZY_LABELS = [
  { label: 'First Name', key: 'firstName' },
  { label: 'Last Name', key: 'lastName' },
  { label: 'Full Name', key: 'fullName' },
  { label: 'Email Address', key: 'email' },
  { label: 'Phone Number', key: 'phone' },
  { label: 'Street Address', key: 'address.street' },
  { label: 'Apartment/Unit', key: 'address.unit' },
  { label: 'City', key: 'address.city' },
  { label: 'State', key: 'address.state' },
  { label: 'ZIP Code', key: 'address.zip' },
  { label: 'Postal Code', key: 'address.zip' },
  { label: 'Country', key: 'address.country' },
  { label: 'Date of Birth', key: 'dateOfBirth' },
  { label: 'Birth Date', key: 'dateOfBirth' },
  { label: 'Social Security Number', key: 'ssn' },
  { label: 'SSN', key: 'ssn' },
  { label: 'Purchase Date', key: 'purchaseDate' },
  { label: 'Date of Purchase', key: 'purchaseDate' },
  { label: 'Product Name', key: 'productName' },
  { label: 'Product Model', key: 'productModel' },
  { label: 'Model Number', key: 'productModel' },
  { label: 'Serial Number', key: 'serialNumber' },
  { label: 'Receipt Number', key: 'receiptNumber' },
  { label: 'Purchase Amount', key: 'purchaseAmount' },
  { label: 'Store Name', key: 'storeName' },
  { label: 'Retailer', key: 'storeName' },
  { label: 'Mailing Address', key: 'address.street' },
  { label: 'Home Address', key: 'address.street' },
  { label: 'Address Line 1', key: 'address.street' },
  { label: 'Address Line 2', key: 'address.unit' },
  { label: 'Claimant Name', key: 'fullName' },
  { label: 'Your Name', key: 'fullName' },
  { label: 'Contact Email', key: 'email' },
  { label: 'Contact Phone', key: 'phone' },
  { label: 'Daytime Phone', key: 'phone' },
];

// Initialize Fuse.js for fuzzy matching
let fuse = null;

function initFuse() {
  if (typeof Fuse !== 'undefined') {
    fuse = new Fuse(FUZZY_LABELS, {
      keys: ['label'],
      threshold: 0.4,
      includeScore: true,
    });
  }
}

// Get nested value from object using dot notation
function getNestedValue(obj, path) {
  if (!path) return undefined;
  const keys = path.split('.');
  let value = obj;
  for (const key of keys) {
    if (value === null || value === undefined) return undefined;
    value = value[key];
  }
  return value;
}

// Get all form fields on the page
function getFormFields() {
  const selectors = [
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"])',
    'select',
    'textarea',
  ];
  return Array.from(document.querySelectorAll(selectors.join(', ')));
}

// Get label text for a field
function getFieldLabel(field) {
  // Check for explicit label
  if (field.id) {
    const label = document.querySelector(`label[for="${field.id}"]`);
    if (label) return label.textContent.trim();
  }
  
  // Check for wrapping label
  const parentLabel = field.closest('label');
  if (parentLabel) {
    const text = parentLabel.textContent.replace(field.value || '', '').trim();
    if (text) return text;
  }
  
  // Check for aria-label
  if (field.getAttribute('aria-label')) {
    return field.getAttribute('aria-label');
  }
  
  // Check for placeholder
  if (field.placeholder) {
    return field.placeholder;
  }
  
  // Check for nearby text (previous sibling or parent text)
  const prev = field.previousElementSibling;
  if (prev && (prev.tagName === 'LABEL' || prev.tagName === 'SPAN')) {
    return prev.textContent.trim();
  }
  
  return '';
}

// Tier 1: Direct matching
function tier1Match(field) {
  // Check autocomplete attribute
  const autocomplete = field.getAttribute('autocomplete');
  if (autocomplete && DIRECT_MAPPINGS.autocomplete[autocomplete]) {
    return DIRECT_MAPPINGS.autocomplete[autocomplete];
  }
  
  // Check ID and name attributes against patterns
  const identifiers = [
    field.id?.toLowerCase(),
    field.name?.toLowerCase(),
    field.getAttribute('data-field')?.toLowerCase(),
  ].filter(Boolean);
  
  for (const identifier of identifiers) {
    for (const [pattern, key] of Object.entries(DIRECT_MAPPINGS.patterns)) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(identifier)) {
        return key;
      }
    }
  }
  
  return null;
}

// Tier 2: Fuzzy matching using Fuse.js
function tier2Match(field) {
  if (!fuse) return null;
  
  const label = getFieldLabel(field);
  if (!label) return null;
  
  const results = fuse.search(label);
  if (results.length > 0 && results[0].score < 0.4) {
    return results[0].item.key;
  }
  
  return null;
}

// Tier 3: Agentic matching (placeholder for LLM integration)
async function tier3Match(field, context) {
  // This would call an LLM API to intelligently map the field
  // For now, we'll return null and flag for user review
  console.log('[Claimly] Tier 3 needed for field:', {
    id: field.id,
    name: field.name,
    label: getFieldLabel(field),
  });
  return null;
}

// Fill a single field with a value
function fillField(field, value, tier) {
  if (value === undefined || value === null) return false;
  
  const stringValue = String(value);
  
  if (field.tagName === 'SELECT') {
    // Handle select dropdowns
    const options = Array.from(field.options);
    const matchingOption = options.find(opt => 
      opt.value.toLowerCase() === stringValue.toLowerCase() ||
      opt.textContent.toLowerCase().includes(stringValue.toLowerCase())
    );
    if (matchingOption) {
      field.value = matchingOption.value;
    } else {
      return false;
    }
  } else if (field.type === 'checkbox') {
    field.checked = value === true || stringValue.toLowerCase() === 'true' || stringValue === '1';
  } else if (field.type === 'radio') {
    if (field.value.toLowerCase() === stringValue.toLowerCase()) {
      field.checked = true;
    }
  } else {
    field.value = stringValue;
  }
  
  // Trigger input events for frameworks
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
  field.dispatchEvent(new Event('blur', { bubbles: true }));
  
  // Add visual feedback
  field.classList.add('claimly-filled');
  
  return true;
}

// Main autofill function
async function autofillForm(packet) {
  claimPacket = packet;
  filledFields = [];
  pendingFields = [];
  
  const fields = getFormFields();
  console.log(`[Claimly] Found ${fields.length} form fields`);
  
  for (const field of fields) {
    let matchedKey = null;
    let tier = null;
    
    // Try Tier 1 first
    matchedKey = tier1Match(field);
    if (matchedKey) {
      tier = 1;
    }
    
    // Try Tier 2 if Tier 1 failed
    if (!matchedKey) {
      matchedKey = tier2Match(field);
      if (matchedKey) {
        tier = 2;
      }
    }
    
    // Try Tier 3 if both failed
    if (!matchedKey) {
      matchedKey = await tier3Match(field, { label: getFieldLabel(field) });
      if (matchedKey) {
        tier = 3;
      }
    }
    
    if (matchedKey) {
      const value = getNestedValue(claimPacket.userData, matchedKey);
      if (value !== undefined) {
        const success = fillField(field, value, tier);
        if (success) {
          filledFields.push({
            field,
            key: matchedKey,
            value,
            tier,
          });
          console.log(`[Claimly] ✓ Filled "${matchedKey}" via Tier ${tier}:`, value);
        }
      } else {
        // Key matched but no value in packet
        pendingFields.push({
          field,
          key: matchedKey,
          label: getFieldLabel(field),
        });
        field.classList.add('claimly-needs-attention');
      }
    } else if (field.required) {
      // Required field but couldn't match
      pendingFields.push({
        field,
        key: null,
        label: getFieldLabel(field),
      });
      field.classList.add('claimly-needs-attention');
    }
  }
  
  showStatusBadge();
  return {
    filled: filledFields.length,
    pending: pendingFields.length,
  };
}

// Show floating status badge
function showStatusBadge() {
  if (statusBadge) {
    statusBadge.remove();
  }
  
  statusBadge = document.createElement('div');
  statusBadge.className = 'claimly-badge';
  statusBadge.innerHTML = `
    <button class="claimly-btn-close" id="claimly-close">×</button>
    <div class="claimly-badge-header">
      <div class="claimly-badge-logo">C</div>
      <span>Claimly Autofill</span>
    </div>
    <div class="claimly-badge-stats">
      <span class="claimly-stat claimly-stat-filled">
        ✓ ${filledFields.length} filled
      </span>
      ${pendingFields.length > 0 ? `
        <span class="claimly-stat claimly-stat-pending">
          ⚠ ${pendingFields.length} need review
        </span>
      ` : ''}
    </div>
    <div class="claimly-badge-actions">
      <button class="claimly-btn claimly-btn-secondary" id="claimly-clear">Clear All</button>
      <button class="claimly-btn claimly-btn-primary" id="claimly-review">Review Form</button>
    </div>
  `;
  
  document.body.appendChild(statusBadge);
  
  // Event listeners
  document.getElementById('claimly-close').addEventListener('click', () => {
    statusBadge.remove();
    statusBadge = null;
  });
  
  document.getElementById('claimly-clear').addEventListener('click', clearAutofill);
  document.getElementById('claimly-review').addEventListener('click', reviewForm);
}

// Clear all autofilled values
function clearAutofill() {
  for (const { field } of filledFields) {
    field.value = '';
    field.classList.remove('claimly-filled');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }
  
  for (const { field } of pendingFields) {
    field.classList.remove('claimly-needs-attention');
  }
  
  filledFields = [];
  pendingFields = [];
  
  if (statusBadge) {
    statusBadge.remove();
    statusBadge = null;
  }
}

// Scroll to first pending field
function reviewForm() {
  if (pendingFields.length > 0) {
    pendingFields[0].field.scrollIntoView({ behavior: 'smooth', block: 'center' });
    pendingFields[0].field.focus();
  } else if (filledFields.length > 0) {
    filledFields[0].field.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'autofill') {
    autofillForm(message.claimPacket).then(result => {
      sendResponse(result);
    });
    return true; // Keep channel open for async response
  }
  
  if (message.action === 'clear') {
    clearAutofill();
    sendResponse({ success: true });
  }
  
  if (message.action === 'getStatus') {
    sendResponse({
      filled: filledFields.length,
      pending: pendingFields.length,
      hasClaimPacket: !!claimPacket,
    });
  }
  
  if (message.action === 'detectFields') {
    const fields = getFormFields();
    sendResponse({
      count: fields.length,
      fields: fields.map(f => ({
        id: f.id,
        name: f.name,
        type: f.type,
        label: getFieldLabel(f),
        required: f.required,
      })),
    });
  }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFuse);
} else {
  initFuse();
}

// Inject Fuse.js script
const fuseScript = document.createElement('script');
fuseScript.src = chrome.runtime.getURL('lib/fuse.min.js');
fuseScript.onload = initFuse;
document.head.appendChild(fuseScript);

console.log('[Claimly] Autofill Agent loaded');
