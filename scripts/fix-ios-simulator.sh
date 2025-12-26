#!/bin/bash
# Script to fix iOS Simulator runtime issues

echo "🔧 Fixing iOS Simulator Runtime..."
echo ""

# Check if Xcode is installed
if ! command -v xcodebuild &> /dev/null; then
    echo "❌ Xcode is not installed. Please install Xcode from the App Store."
    exit 1
fi

echo "📦 Checking available iOS runtimes..."
RUNTIMES=$(xcrun simctl list runtimes 2>&1)

if [ -z "$RUNTIMES" ] || [ "$RUNTIMES" == "== Runtimes ==" ]; then
    echo "⚠️  No iOS runtimes found. Installing iOS runtime..."
    echo ""
    echo "Please follow these steps:"
    echo "1. Open Xcode"
    echo "2. Go to Xcode → Settings → Platforms (or Components)"
    echo "3. Download iOS Simulator runtime"
    echo "4. Wait for download to complete"
    echo ""
    echo "Or run manually:"
    echo "  xcodebuild -downloadPlatform iOS"
    echo ""
    read -p "Press Enter after you've installed the runtime in Xcode..."
else
    echo "✅ Found runtimes:"
    echo "$RUNTIMES"
fi

echo ""
echo "📱 Checking available devices..."
DEVICES=$(xcrun simctl list devices available 2>&1 | grep -i "iphone" | head -5)

if [ -z "$DEVICES" ]; then
    echo "⚠️  No iPhone simulators available. Creating one..."
    
    # Get available runtimes
    RUNTIME=$(xcrun simctl list runtimes 2>&1 | grep -i "iOS" | head -1 | awk '{print $NF}' | tr -d '()')
    
    if [ -z "$RUNTIME" ]; then
        echo "❌ No iOS runtime available. Please install one in Xcode first."
        exit 1
    fi
    
    echo "Creating iPhone 15 simulator with runtime: $RUNTIME"
    xcrun simctl create "iPhone 15" "iPhone 15" "$RUNTIME" 2>&1
    echo "✅ Simulator created!"
else
    echo "✅ Available devices:"
    echo "$DEVICES"
fi

echo ""
echo "✅ iOS Simulator setup complete!"
echo "You can now run: make mobile-ios"




