# Claimly Autofill Agent - Chrome Extension

AI-powered autofill for class action settlement forms. Part of the Claimly platform.

## Features

- **Tiered Matching System**:
  - **Tier 1 (Direct)**: Matches fields by ID, Name, and Autocomplete attributes
  - **Tier 2 (Fuzzy)**: Uses Fuse.js to match field labels to data keys
  - **Tier 3 (Agentic)**: LLM-based mapping for complex fields (requires backend)

- **Visual Feedback**: Highlights filled fields in green, pending fields in yellow
- **Human-in-the-Loop**: Never auto-submits; always lets user review

## Installation

### Development Mode

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `extension` folder from this project
5. The Claimly icon should appear in your toolbar

### Download Fuse.js (Required for Tier 2 matching)

```bash
# From the extension directory
mkdir -p lib
curl -o lib/fuse.min.js https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.min.js
```

Or manually download from [Fuse.js CDN](https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.min.js) and save to `extension/lib/fuse.min.js`.

## Testing the Extension

### Option 1: Test on Any Form

1. Navigate to any website with a form (e.g., a contact form, signup page)
2. Click the Claimly extension icon
3. Click **Load Sample** to load test data
4. Click **Autofill Form**
5. Review the highlighted fields

### Option 2: Test on Real Settlement Sites

**Example settlement claim sites** (for testing purposes):
- Search for "class action settlement claim form" to find active settlements
- Many settlements use similar form structures

### Option 3: Create a Local Test Form

Create a simple HTML file with form fields:

```html
<!DOCTYPE html>
<html>
<head><title>Test Form</title></head>
<body>
  <form>
    <label>First Name: <input type="text" name="firstName" /></label><br>
    <label>Last Name: <input type="text" name="lastName" /></label><br>
    <label>Email: <input type="email" name="email" autocomplete="email" /></label><br>
    <label>Phone: <input type="tel" name="phone" /></label><br>
    <label>Street Address: <input type="text" name="address1" /></label><br>
    <label>City: <input type="text" name="city" /></label><br>
    <label>State: <input type="text" name="state" /></label><br>
    <label>ZIP Code: <input type="text" name="zip" /></label><br>
    <label>Product Name: <input type="text" name="productName" /></label><br>
    <label>Purchase Date: <input type="date" name="purchaseDate" /></label><br>
    <button type="submit">Submit</button>
  </form>
</body>
</html>
```

Open this file in Chrome (`file:///path/to/test.html`) and test the extension.

## Using Custom Claim Packets

### Packet Structure

```json
{
  "id": "unique-packet-id",
  "settlementName": "Settlement Name",
  "settlementUrl": "https://settlement-site.com/claim",
  "userData": {
    "firstName": "John",
    "lastName": "Doe",
    "fullName": "John Doe",
    "email": "john@email.com",
    "phone": "555-123-4567",
    "dateOfBirth": "1990-01-15",
    "address": {
      "street": "123 Main St",
      "unit": "Apt 4B",
      "city": "San Francisco",
      "state": "CA",
      "zip": "94102",
      "country": "United States"
    },
    "productName": "Product Name",
    "productModel": "Model-123",
    "serialNumber": "SN-ABC123",
    "purchaseDate": "2023-03-15",
    "purchaseAmount": "299.99",
    "storeName": "Store Name",
    "receiptNumber": "REC-123"
  },
  "caseAnswers": {
    "ownedProduct": true,
    "purchasedInUS": true,
    "experiencedIssue": true,
    "claimAmount": "full-refund"
  }
}
```

### Loading a Custom Packet

1. Click the Claimly extension icon
2. Click anywhere in the "No packet loaded" area
3. Paste your JSON claim packet
4. Click **Load Packet**

## How Matching Works

### Tier 1: Direct Matching

The extension first tries to match fields using standard HTML attributes:

| Attribute | Example | Maps To |
|-----------|---------|---------|
| `autocomplete="given-name"` | First name field | `firstName` |
| `autocomplete="email"` | Email field | `email` |
| `name="firstName"` | First name by name | `firstName` |
| `id="address1"` | Address by ID | `address.street` |

### Tier 2: Fuzzy Matching

If Tier 1 fails, the extension looks at field labels and uses fuzzy matching:

- "Mailing Address" → `address.street`
- "Claimant Name" → `fullName`
- "Date of Purchase" → `purchaseDate`

### Tier 3: Agentic Matching (Future)

For complex fields that can't be matched automatically, the extension can call an LLM API to intelligently map the field. This requires the backend to be running.

## File Structure

```
extension/
├── manifest.json          # Chrome extension manifest (MV3)
├── background/
│   └── service-worker.js  # Background service worker
├── content/
│   ├── content.js         # Main autofill logic
│   └── content.css        # Visual feedback styles
├── popup/
│   ├── popup.html         # Extension popup UI
│   ├── popup.css          # Popup styles
│   └── popup.js           # Popup logic
├── lib/
│   └── fuse.min.js        # Fuzzy matching library (download required)
├── icons/                 # Extension icons
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── data/
│   └── sample-packets.json # Sample claim packets
└── README.md              # This file
```

## Development

### Debugging

1. Open `chrome://extensions/`
2. Click **Inspect views: service worker** to debug background script
3. Right-click the extension icon → **Inspect popup** to debug popup
4. Use browser DevTools on any page to debug content script (look for `[Claimly]` logs)

### Reloading Changes

After making changes:
1. Go to `chrome://extensions/`
2. Click the refresh icon on the Claimly extension
3. Reload any pages where you want to test

## API Integration (Future)

The extension is designed to work with the Claimly backend API for:

- Fetching user claim packets
- Tier 3 agentic field mapping
- Submitting claim status updates

Configure the API URL in `background/service-worker.js`:

```javascript
const CONFIG = {
  apiUrl: 'http://localhost:5171',
  llmEndpoint: '/api/autofill/map-field',
};
```

## Troubleshooting

### Extension not appearing
- Make sure Developer mode is enabled
- Check that you selected the correct `extension` folder

### Fields not being filled
- Check browser console for `[Claimly]` logs
- Verify the claim packet has data for those fields
- Some sites use shadow DOM or iframes which may not be accessible

### Fuzzy matching not working
- Ensure `lib/fuse.min.js` exists
- Check console for Fuse.js loading errors

## License

Part of the Claimly project - AI-Powered Settlement Discovery & Autofill.
