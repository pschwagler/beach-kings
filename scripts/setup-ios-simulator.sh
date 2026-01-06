#!/bin/bash
# Setup iOS Simulator with proper runtime

echo "🔧 Setting up iOS Simulator..."
echo ""

# Check Xcode
if ! command -v xcodebuild &> /dev/null; then
    echo "❌ Xcode not found. Please install Xcode from App Store."
    exit 1
fi

echo "📱 Step 1: Installing iOS Simulator Runtime"
echo ""
echo "The runtime is downloaded but needs to be installed via Xcode UI."
echo ""
echo "Please follow these steps:"
echo "1. Opening Xcode for you..."
open -a Xcode
echo ""
echo "2. In Xcode:"
echo "   - Go to: Xcode → Settings (or Preferences)"
echo "   - Click the 'Platforms' tab (or 'Components' in older versions)"
echo "   - Find 'iOS 26.1 Simulator' in the list"
echo "   - Click the 'Get' or install button next to it"
echo "   - Wait for installation to complete"
echo ""
echo "3. After installation, come back here and press Enter"
read -p "Press Enter after you've installed iOS 26.1 Simulator in Xcode Settings → Platforms..."

echo ""
echo "📱 Step 2: Verifying runtime installation..."
sleep 2

RUNTIMES=$(xcrun simctl list runtimes 2>&1 | grep -i "iOS")
if [ -z "$RUNTIMES" ] || [ "$RUNTIMES" == "== Runtimes ==" ]; then
    echo "❌ Runtime still not installed. Please install it in Xcode Settings → Platforms"
    exit 1
else
    echo "✅ Runtime found:"
    echo "$RUNTIMES"
fi

echo ""
echo "📱 Step 3: Creating iPhone 15 simulator..."

# Get the first available iOS runtime
RUNTIME=$(xcrun simctl list runtimes 2>&1 | grep -i "iOS" | head -1 | awk -F'(' '{print $2}' | awk -F')' '{print $1}')

if [ -z "$RUNTIME" ]; then
    echo "❌ Could not find iOS runtime. Please install one in Xcode."
    exit 1
fi

echo "Using runtime: $RUNTIME"

# Delete existing iPhone 15 if it exists
xcrun simctl delete "iPhone 15" 2>/dev/null

# Create new simulator
DEVICE_ID=$(xcrun simctl create "iPhone 15" "iPhone 15" "$RUNTIME" 2>&1)

if [ $? -eq 0 ]; then
    echo "✅ Created iPhone 15 simulator: $DEVICE_ID"
    echo ""
    echo "✅ Setup complete! You can now run: make mobile-ios"
else
    echo "❌ Failed to create simulator. Error: $DEVICE_ID"
    exit 1
fi
