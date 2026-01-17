/**
 * Claimly Autofill Agent - Popup Script
 */

// Sample claim packet for testing
const SAMPLE_CLAIM_PACKET = {
  id: 'sample-packet-001',
  settlementName: 'Tech Product Settlement 2024',
  settlementUrl: 'https://example-settlement.com',
  userData: {
    firstName: 'John',
    lastName: 'Doe',
    fullName: 'John Doe',
    email: 'john.doe@email.com',
    phone: '555-123-4567',
    dateOfBirth: '1990-05-15',
    address: {
      street: '123 Main Street',
      unit: 'Apt 4B',
      city: 'San Francisco',
      state: 'CA',
      zip: '94102',
      country: 'United States',
    },
    productName: 'TechWidget Pro',
    productModel: 'TW-2000',
    serialNumber: 'SN-ABC123456',
    purchaseDate: '2023-03-15',
    purchaseAmount: '299.99',
    storeName: 'Best Buy',
    receiptNumber: 'REC-789012',
  },
  caseAnswers: {
    ownedProduct: true,
    purchasedInUS: true,
    experiencedIssue: true,
    claimAmount: 'full-refund',
  },
};

// DOM Elements
const elements = {
  statusCard: document.getElementById('status-card'),
  statusIcon: document.getElementById('status-icon'),
  statusTitle: document.getElementById('status-title'),
  statusSubtitle: document.getElementById('status-subtitle'),
  packetEmpty: document.getElementById('packet-empty'),
  packetInfo: document.getElementById('packet-info'),
  packetName: document.getElementById('packet-name'),
  packetUser: document.getElementById('packet-user'),
  packetFields: document.getElementById('packet-fields'),
  autofillBtn: document.getElementById('autofill-btn'),
  detectBtn: document.getElementById('detect-btn'),
  clearBtn: document.getElementById('clear-btn'),
  loadSampleBtn: document.getElementById('load-sample'),
  clearPacketBtn: document.getElementById('clear-packet'),
  fieldsSection: document.getElementById('fields-section'),
  fieldsList: document.getElementById('fields-list'),
  fieldCount: document.getElementById('field-count'),
  loadSection: document.getElementById('load-section'),
  packetInput: document.getElementById('packet-input'),
  cancelLoadBtn: document.getElementById('cancel-load'),
  confirmLoadBtn: document.getElementById('confirm-load'),
};

// State
let activePacket = null;
let detectedFields = [];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Claimly Popup] Initializing...');
  
  // Load active packet from storage
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getActivePacket' });
    console.log('[Claimly Popup] Got active packet:', response);
    if (response) {
      activePacket = response;
      updatePacketUI();
    }
  } catch (error) {
    console.error('[Claimly Popup] Error loading packet:', error);
  }
  
  // Detect fields on current page
  detectFields();
  
  // Event listeners with null checks
  if (elements.autofillBtn) elements.autofillBtn.addEventListener('click', runAutofill);
  if (elements.detectBtn) elements.detectBtn.addEventListener('click', detectFields);
  if (elements.clearBtn) elements.clearBtn.addEventListener('click', clearForm);
  if (elements.loadSampleBtn) {
    elements.loadSampleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[Claimly Popup] Load Sample clicked');
      loadSamplePacket();
    });
  }
  if (elements.clearPacketBtn) elements.clearPacketBtn.addEventListener('click', clearPacket);
  if (elements.cancelLoadBtn) elements.cancelLoadBtn.addEventListener('click', hideLoadSection);
  if (elements.confirmLoadBtn) elements.confirmLoadBtn.addEventListener('click', loadCustomPacket);
  
  console.log('[Claimly Popup] Initialized');
});

// Update status display
function updateStatus(icon, title, subtitle, type = '') {
  elements.statusIcon.textContent = icon;
  elements.statusTitle.textContent = title;
  elements.statusSubtitle.textContent = subtitle;
  elements.statusCard.className = `status-card ${type}`;
}

// Update packet display
function updatePacketUI() {
  if (activePacket) {
    elements.packetEmpty.style.display = 'none';
    elements.packetInfo.style.display = 'block';
    elements.packetName.textContent = activePacket.settlementName || 'Unnamed Packet';
    elements.packetUser.textContent = `👤 ${activePacket.userData?.fullName || activePacket.userData?.firstName || 'Unknown User'}`;
    const fieldCount = Object.keys(flattenObject(activePacket.userData || {})).length;
    elements.packetFields.textContent = `📋 ${fieldCount} data fields`;
    elements.autofillBtn.disabled = false;
  } else {
    elements.packetEmpty.style.display = 'flex';
    elements.packetInfo.style.display = 'none';
    elements.autofillBtn.disabled = true;
  }
}

// Flatten nested object for counting
function flattenObject(obj, prefix = '') {
  return Object.keys(obj).reduce((acc, k) => {
    const pre = prefix.length ? prefix + '.' : '';
    if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
      Object.assign(acc, flattenObject(obj[k], pre + k));
    } else {
      acc[pre + k] = obj[k];
    }
    return acc;
  }, {});
}

// Detect form fields on current page
async function detectFields() {
  updateStatus('🔍', 'Detecting forms...', 'Scanning page');
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab?.id) {
      updateStatus('⚠️', 'No active tab', 'Open a page with a form', 'warning');
      return;
    }
    
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'detectFields' });
    
    if (response && response.fields) {
      detectedFields = response.fields;
      const count = response.count;
      
      if (count > 0) {
        updateStatus('✅', `${count} fields found`, 'Ready to autofill', 'success');
        elements.fieldCount.textContent = count;
        elements.fieldsSection.style.display = 'block';
        renderFieldsList(response.fields);
      } else {
        updateStatus('📄', 'No form fields', 'This page has no fillable forms', 'warning');
        elements.fieldsSection.style.display = 'none';
      }
    }
  } catch (error) {
    console.error('Detection error:', error);
    updateStatus('❌', 'Detection failed', 'Content script not loaded', 'error');
  }
}

// Render detected fields list
function renderFieldsList(fields) {
  elements.fieldsList.innerHTML = fields.slice(0, 10).map(field => `
    <div class="field-item">
      <div>
        <span class="field-name">${field.label || field.name || field.id || 'Unnamed'}</span>
        <span class="field-type">${field.type || 'text'}</span>
      </div>
      <span class="field-status">${field.required ? '⚠️' : '✓'}</span>
    </div>
  `).join('');
  
  if (fields.length > 10) {
    elements.fieldsList.innerHTML += `
      <div class="field-item" style="justify-content: center; color: var(--text-muted);">
        + ${fields.length - 10} more fields
      </div>
    `;
  }
}

// Run autofill
async function runAutofill() {
  if (!activePacket) {
    updateStatus('⚠️', 'No packet loaded', 'Load a claim packet first', 'warning');
    return;
  }
  
  updateStatus('⏳', 'Autofilling...', 'Please wait');
  elements.autofillBtn.disabled = true;
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'triggerAutofill',
      packet: activePacket,
    });
    
    if (response.error) {
      updateStatus('❌', 'Autofill failed', response.error, 'error');
    } else {
      const { filled, pending } = response;
      if (pending > 0) {
        updateStatus('⚠️', `${filled} filled, ${pending} need review`, 'Check highlighted fields', 'warning');
      } else {
        updateStatus('✅', `${filled} fields filled`, 'Review before submitting', 'success');
      }
    }
  } catch (error) {
    console.error('Autofill error:', error);
    updateStatus('❌', 'Autofill failed', error.message, 'error');
  }
  
  elements.autofillBtn.disabled = false;
}

// Clear form
async function clearForm() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id, { action: 'clear' });
    updateStatus('🗑️', 'Form cleared', 'All fields reset');
    detectFields();
  } catch (error) {
    console.error('Clear error:', error);
  }
}

// Load sample packet
async function loadSamplePacket() {
  console.log('[Claimly Popup] Loading sample packet...');
  try {
    activePacket = SAMPLE_CLAIM_PACKET;
    const response = await chrome.runtime.sendMessage({ action: 'setActivePacket', packet: activePacket });
    console.log('[Claimly Popup] setActivePacket response:', response);
    updatePacketUI();
    updateStatus('📋', 'Sample packet loaded', 'Ready to autofill', 'success');
  } catch (error) {
    console.error('[Claimly Popup] Error loading sample:', error);
    updateStatus('❌', 'Error loading sample', error.message, 'error');
  }
}

// Clear current packet
async function clearPacket() {
  activePacket = null;
  await chrome.runtime.sendMessage({ action: 'setActivePacket', packet: null });
  updatePacketUI();
}

// Show load section for custom packet
function showLoadSection() {
  elements.loadSection.style.display = 'block';
}

// Hide load section
function hideLoadSection() {
  elements.loadSection.style.display = 'none';
  elements.packetInput.value = '';
}

// Load custom packet from textarea
async function loadCustomPacket() {
  const input = elements.packetInput.value.trim();
  
  if (!input) {
    alert('Please paste a JSON claim packet');
    return;
  }
  
  try {
    const packet = JSON.parse(input);
    
    if (!packet.userData) {
      alert('Invalid packet: missing userData field');
      return;
    }
    
    activePacket = {
      id: packet.id || crypto.randomUUID(),
      settlementName: packet.settlementName || 'Custom Packet',
      userData: packet.userData,
      caseAnswers: packet.caseAnswers || {},
    };
    
    await chrome.runtime.sendMessage({ action: 'setActivePacket', packet: activePacket });
    updatePacketUI();
    hideLoadSection();
    updateStatus('📋', 'Custom packet loaded', 'Ready to autofill', 'success');
  } catch (error) {
    alert('Invalid JSON: ' + error.message);
  }
}

// Listen for packet empty click to show load section
elements.packetEmpty.addEventListener('click', (e) => {
  if (e.target !== elements.loadSampleBtn) {
    showLoadSection();
  }
});
