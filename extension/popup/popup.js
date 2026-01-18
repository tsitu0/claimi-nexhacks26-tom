/**
 * Claimi Autofill Agent - Popup Script
 * 
 * Claim packets are now loaded from the Claimi dashboard.
 * Users must log in at the dashboard, select a settlement,
 * and click "Prepare claim for autofill" to send data to this extension.
 */

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
  packetMeta: document.getElementById('packet-meta'),
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
  console.log('[Claimi Popup] Initializing...');
  
  // Load active packet from storage
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getActivePacket' });
    console.log('[Claimi Popup] Got active packet:', response);
    if (response) {
      activePacket = response;
      updatePacketUI();
    }
  } catch (error) {
    console.error('[Claimi Popup] Error loading packet:', error);
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
      console.log('[Claimi Popup] How to Load clicked');
      showDashboardInstructions();
    });
  }
  if (elements.clearPacketBtn) elements.clearPacketBtn.addEventListener('click', clearPacket);
  if (elements.cancelLoadBtn) elements.cancelLoadBtn.addEventListener('click', hideLoadSection);
  if (elements.confirmLoadBtn) elements.confirmLoadBtn.addEventListener('click', loadCustomPacket);
  
  console.log('[Claimi Popup] Initialized');
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
    
    // Show user info
    const userName = activePacket._meta?.userFullName || 
      activePacket.userData?.fullName || 
      activePacket.userData?.firstName || 
      'Unknown User';
    elements.packetUser.textContent = `👤 ${userName}`;
    
    // Count data fields
    const fieldCount = Object.keys(flattenObject(activePacket.userData || {})).length;
    const caseAnswerCount = Object.keys(activePacket.caseAnswers || {}).length;
    elements.packetFields.textContent = `📋 ${fieldCount} profile fields, ${caseAnswerCount} case answers`;
    
    // Show metadata if available
    if (elements.packetMeta) {
      if (activePacket._meta?.source === 'dashboard') {
        const receivedAt = activePacket._meta?.receivedAt ? 
          formatTimeAgo(new Date(activePacket._meta.receivedAt)) : 
          'unknown time';
        
        // Build metadata HTML
        let metaHtml = `<span class="packet-meta-source">✓ From dashboard ${receivedAt}</span>`;
        
        // Add claim form URL link if available
        const claimFormUrl = activePacket.claimFormUrl || activePacket._meta?.claimFormUrl;
        if (claimFormUrl && claimFormUrl.startsWith('http')) {
          metaHtml += `<a href="${claimFormUrl}" target="_blank" class="packet-meta-link">📄 Open claim form</a>`;
        }
        
        elements.packetMeta.innerHTML = metaHtml;
        elements.packetMeta.style.display = 'flex';
      } else {
        elements.packetMeta.style.display = 'none';
      }
    }
    
    elements.autofillBtn.disabled = false;
  } else {
    elements.packetEmpty.style.display = 'flex';
    elements.packetInfo.style.display = 'none';
    elements.autofillBtn.disabled = true;
    if (elements.packetMeta) {
      elements.packetMeta.style.display = 'none';
    }
  }
}

// Format time ago helper
function formatTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
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

// Show instructions for loading a packet from dashboard
function showDashboardInstructions() {
  console.log('[Claimi Popup] Showing dashboard instructions');
  updateStatus('📋', 'Load from Dashboard', 'Go to claimi.app to prepare a claim', 'info');
  
  // Show a helpful message
  const message = `To use Claimi autofill:

1. Go to the Claimi dashboard (localhost:3000 or claimi.app)
2. Log in to your account
3. Select a settlement you qualify for
4. Answer the eligibility questions
5. Click "Prepare claim for autofill"
6. Navigate to the claim form
7. Come back here and click Autofill!`;
  
  alert(message);
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
