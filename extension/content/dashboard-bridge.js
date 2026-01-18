/**
 * Claimi Dashboard Bridge - Content Script
 * 
 * This script runs on the Claimi dashboard (localhost:3000 and claimi.app)
 * and listens for claim packet data from the web app, forwarding it to
 * the extension's service worker.
 */

(function() {
  'use strict';

  console.log('[Claimi Bridge] Dashboard bridge loaded');

  // Listen for custom event from the dashboard
  window.addEventListener('claimi-claim-packet', async (event) => {
    console.log('[Claimi Bridge] Received claim packet from dashboard');
    
    const packet = event.detail;
    
    if (!packet || !packet.userData) {
      console.error('[Claimi Bridge] Invalid packet received:', packet);
      return;
    }

    try {
      // Send the packet to the service worker
      const response = await chrome.runtime.sendMessage({
        action: 'setClaimPacket',
        packet: packet
      });

      console.log('[Claimi Bridge] Packet stored successfully:', response);

      // Dispatch success event back to the dashboard
      window.dispatchEvent(new CustomEvent('claimi-packet-stored', {
        detail: { success: true, packetId: packet.id }
      }));
    } catch (error) {
      console.error('[Claimi Bridge] Error storing packet:', error);
      
      // Dispatch error event back to the dashboard
      window.dispatchEvent(new CustomEvent('claimi-packet-stored', {
        detail: { success: false, error: error.message }
      }));
    }
  });

  // Listen for request to check if extension is installed
  window.addEventListener('claimi-check-extension', () => {
    console.log('[Claimi Bridge] Extension check requested');
    window.dispatchEvent(new CustomEvent('claimi-extension-ready', {
      detail: { installed: true, version: chrome.runtime.getManifest().version }
    }));
  });

  // Announce that the bridge is ready
  window.dispatchEvent(new CustomEvent('claimi-bridge-ready', {
    detail: { version: chrome.runtime.getManifest().version }
  }));

  console.log('[Claimi Bridge] Ready and listening for claim packets');
})();
