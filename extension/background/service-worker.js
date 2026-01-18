
// Default API configuration
const CONFIG = {
  apiUrl: 'http://localhost:5171',
  llmEndpoint: '/api/autofill/map-field',
  triageEndpoint: '/api/autofill/triage-fields',
};

// Storage keys
const STORAGE_KEYS = {
  claimPackets: 'claimly_packets',
  activePacket: 'claimly_active_packet',
  settings: 'claimly_settings',
};

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Claimi] Extension installed');
  
  // Set default storage
  chrome.storage.local.set({
    [STORAGE_KEYS.claimPackets]: [],
    [STORAGE_KEYS.activePacket]: null,
    [STORAGE_KEYS.settings]: {
      autoDetect: true,
      showBadge: true,
      tier3Enabled: false,
    },
  });
  
  // Create context menu
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'claimly-autofill',
      title: 'Autofill with Claimi',
      contexts: ['page', 'editable'],
    });
  });
});

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'getActivePacket':
      getActivePacket().then(sendResponse);
      return true;
      
    case 'setActivePacket':
      setActivePacket(message.packet).then(sendResponse);
      return true;
    
    // Handle claim packet from dashboard bridge
    case 'setClaimPacket':
      setClaimPacketFromDashboard(message.packet, sender).then(sendResponse);
      return true;
      
    case 'getAllPackets':
      getAllPackets().then(sendResponse);
      return true;
      
    case 'savePacket':
      savePacket(message.packet).then(sendResponse);
      return true;
      
    case 'deletePacket':
      deletePacket(message.packetId).then(sendResponse);
      return true;
      
    case 'tier3MapField':
      tier3MapField(message.fieldInfo, message.packetKeys).then(sendResponse);
      return true;
      
    case 'triageFields':
      triageFields(message.fields, message.availableUserDataKeys, message.availableCaseAnswerKeys, message.caseAnswerMeta).then(sendResponse);
      return true;
      
    case 'triggerAutofill':
      triggerAutofillOnActiveTab(message.packet).then(sendResponse);
      return true;
  }
});

// Get active claim packet
async function getActivePacket() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.activePacket);
  return result[STORAGE_KEYS.activePacket];
}

// Set active claim packet
async function setActivePacket(packet) {
  await chrome.storage.local.set({ [STORAGE_KEYS.activePacket]: packet });
  return { success: true };
}

// Handle claim packet received from dashboard bridge
async function setClaimPacketFromDashboard(packet, sender) {
  console.log('[Claimi] Received claim packet from dashboard');
  
  if (!packet || !packet.userData) {
    console.error('[Claimi] Invalid packet from dashboard:', packet);
    return { success: false, error: 'Invalid packet: missing userData' };
  }

  // Add metadata about when and where the packet came from
  const enrichedPacket = {
    ...packet,
    _meta: {
      source: 'dashboard',
      receivedAt: new Date().toISOString(),
      sourceUrl: sender?.tab?.url || sender?.url || 'unknown',
      userFullName: packet.userData?.fullName || 
        `${packet.userData?.firstName || ''} ${packet.userData?.lastName || ''}`.trim() ||
        'Unknown User',
      userId: packet.userId || null,
      claimFormUrl: packet.claimFormUrl || null,
      answerCount: Array.isArray(packet.answerItems) ? packet.answerItems.length : 0,
      caseAnswerCount: Object.keys(packet.caseAnswers || {}).length
    }
  };

  // Set as active packet
  await chrome.storage.local.set({ [STORAGE_KEYS.activePacket]: enrichedPacket });
  
  // Also save to packets list for history
  await savePacket(enrichedPacket);

  console.log('[Claimi] Claim packet stored successfully:', {
    id: enrichedPacket.id,
    settlement: enrichedPacket.settlementName,
    user: enrichedPacket._meta.userFullName,
    claimFormUrl: enrichedPacket._meta.claimFormUrl,
    answers: enrichedPacket._meta.answerCount
  });

  return { 
    success: true, 
    packetId: enrichedPacket.id,
    settlementName: enrichedPacket.settlementName,
    claimFormUrl: enrichedPacket.claimFormUrl
  };
}

// Get all saved packets
async function getAllPackets() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.claimPackets);
  return result[STORAGE_KEYS.claimPackets] || [];
}

// Save a new packet
async function savePacket(packet) {
  const packets = await getAllPackets();
  const existingIndex = packets.findIndex(p => p.id === packet.id);
  
  if (existingIndex >= 0) {
    packets[existingIndex] = packet;
  } else {
    packets.push({
      ...packet,
      id: packet.id || crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    });
  }
  
  await chrome.storage.local.set({ [STORAGE_KEYS.claimPackets]: packets });
  return { success: true, packets };
}

// Delete a packet
async function deletePacket(packetId) {
  const packets = await getAllPackets();
  const filtered = packets.filter(p => p.id !== packetId);
  await chrome.storage.local.set({ [STORAGE_KEYS.claimPackets]: filtered });
  return { success: true };
}

// Tier 3: Call LLM API to map a field (legacy)
async function tier3MapField(fieldInfo, packetKeys) {
  try {
    const response = await fetch(`${CONFIG.apiUrl}${CONFIG.llmEndpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        field: fieldInfo,
        availableKeys: packetKeys,
      }),
    });
    
    if (!response.ok) {
      throw new Error('API request failed');
    }
    
    const result = await response.json();
    return result.mappedKey || null;
  } catch (error) {
    console.error('[Claimi] Tier 3 API error:', error);
    return null;
  }
}

// LLM Triage: Batch classify all fields before autofill
async function triageFields(fields, availableUserDataKeys, availableCaseAnswerKeys, caseAnswerMeta) {
  try {
    console.log(`[Claimi] Triaging ${fields.length} fields via LLM`);
    
    const response = await fetch(`${CONFIG.apiUrl}${CONFIG.triageEndpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields,
        availableUserDataKeys,
        availableCaseAnswerKeys,
        caseAnswerMeta,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    console.log(`[Claimi] Triage complete. Method: ${result.method}, Fields: ${result.classifications?.length}`);
    return result;
  } catch (error) {
    console.error('[Claimi] Triage API error:', error);
    // Return empty classifications on error - content script will use local fallback
    return { classifications: [], method: 'error', error: error.message };
  }
}

// Trigger autofill on the active tab
async function triggerAutofillOnActiveTab(packet) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab?.id) {
    return { error: 'No active tab found' };
  }
  
  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'autofill',
      claimPacket: packet,
    });
    return response;
  } catch (error) {
    console.error('[Claimi] Error sending autofill message:', error);
    return { error: error.message };
  }
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'claimly-autofill') {
    const packet = await getActivePacket();
    if (packet && tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'autofill',
        claimPacket: packet,
      });
    }
  }
});

console.log('[Claimi] Service worker loaded');
