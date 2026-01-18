#!/bin/bash
# Claimi Extension Setup Script

echo "🚀 Setting up Claimi Autofill Extension..."

# Create directories
mkdir -p lib icons

# Download Fuse.js for fuzzy matching
echo "📦 Downloading Fuse.js..."
curl -sL -o lib/fuse.min.js https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.min.js

if [ -f lib/fuse.min.js ]; then
    echo "✅ Fuse.js downloaded successfully"
else
    echo "⚠️  Failed to download Fuse.js. Please download manually from:"
    echo "   https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.min.js"
    echo "   Save to: extension/lib/fuse.min.js"
fi

# Generate PNG icons from SVG (requires ImageMagick or similar)
if command -v convert &> /dev/null; then
    echo "🎨 Generating PNG icons..."
    convert -background none icons/icon.svg -resize 16x16 icons/icon16.png
    convert -background none icons/icon.svg -resize 32x32 icons/icon32.png
    convert -background none icons/icon.svg -resize 48x48 icons/icon48.png
    convert -background none icons/icon.svg -resize 128x128 icons/icon128.png
    echo "✅ Icons generated"
else
    echo "⚠️  ImageMagick not found. Creating placeholder icons..."
    # Create simple placeholder PNG files (1x1 purple pixel as base64)
    # You should replace these with proper icons
fi

echo ""
echo "✨ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Open Chrome and go to chrome://extensions/"
echo "2. Enable 'Developer mode'"
echo "3. Click 'Load unpacked' and select this extension folder"
echo "4. Test on any webpage with a form!"
