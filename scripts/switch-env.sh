#!/bin/bash

# 🔄 Environment Switch Script
# Usage: ./scripts/switch-env.sh [production|development|test]

set -e

# Get project root directory (parent directory of script location)
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI_DIR="$PROJECT_ROOT/packages/cli"

# Fun environment switch quotes
quotes=(
    "🔄 Switching gears to a new environment..."
    "🌍 Teleporting to a different digital realm..."
    "⚡ Changing the matrix configuration..."
    "🚀 Launching into a new deployment dimension..."
    "🎯 Targeting the perfect environment..."
    "✨ Transforming the development landscape..."
)

# Pick a random quote
quote=${quotes[$RANDOM % ${#quotes[@]}]}
echo "$quote"
echo ""

# Check parameters
if [ $# -eq 0 ]; then
    echo "❌ Error: Please specify environment type"
    echo "Usage: $0 [production|development|test]"
    echo ""
    echo "Available environments:"
    echo "  production  - Production environment (https://api-code.deepvlab.ai)"
    echo "  development - Development environment (http://localhost:6699)"
    echo "  test        - Test environment (https://test.deepvlab.ai)"
    exit 1
fi

ENV_TYPE="$1"

# Validate environment type
case "$ENV_TYPE" in
    production|development|test)
        ;;
    *)
        echo "❌ Error: Invalid environment type '$ENV_TYPE'"
        echo "Supported environments: production, development, test"
        exit 1
        ;;
esac

# Check if source environment file exists
SOURCE_ENV_FILE="$CLI_DIR/.env.$ENV_TYPE"
TARGET_ENV_FILE="$CLI_DIR/.env"

if [ ! -f "$SOURCE_ENV_FILE" ]; then
    echo "❌ Error: Environment configuration file not found: $SOURCE_ENV_FILE"
    exit 1
fi

# Backup current environment file (if exists)
if [ -f "$TARGET_ENV_FILE" ]; then
    BACKUP_FILE="$TARGET_ENV_FILE.backup.$(date +%Y%m%d_%H%M%S)"
    cp "$TARGET_ENV_FILE" "$BACKUP_FILE"
    echo "📦 Current environment config backed up to: $BACKUP_FILE"
fi

# Copy new environment configuration
cp "$SOURCE_ENV_FILE" "$TARGET_ENV_FILE"

# Read and display new configuration
echo "✅ Successfully switched to $ENV_TYPE environment"
echo ""
echo "📋 Current environment configuration:"
echo "=================="
cat "$TARGET_ENV_FILE"
echo "=================="
echo ""

# Display environment-specific information
case "$ENV_TYPE" in
    production)
        echo "🚀 Production environment activated"
        echo "   Server: https://api-code.deepvlab.ai"
        echo "   Please ensure thorough testing before deployment"
        ;;
    development)
        echo "🛠️  Development environment activated"
        echo "   Server: http://localhost:6699"
        echo "   Please ensure local server is running"
        ;;
    test)
        echo "🧪 Test environment activated"
        echo "   Server: https://test.deepvlab.ai"
        echo "   Suitable for integration testing and pre-release validation"
        ;;
esac

echo ""
echo "💡 Tip: Application restart required for environment changes to take effect"
