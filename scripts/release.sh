#!/bin/bash
# Release script for beadsx
# Usage: ./scripts/release.sh [patch|minor|major]
# Default: patch

set -e

# Get version bump type (default: patch)
BUMP_TYPE=${1:-patch}

# Get current version from package.json
CURRENT_VERSION=$(node -p "require('./package.json').version")

# Parse version components
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Calculate new version
case $BUMP_TYPE in
  patch)
    NEW_VERSION="$MAJOR.$MINOR.$((PATCH + 1))"
    ;;
  minor)
    NEW_VERSION="$MAJOR.$((MINOR + 1)).0"
    ;;
  major)
    NEW_VERSION="$((MAJOR + 1)).0.0"
    ;;
  *)
    echo "Usage: $0 [patch|minor|major]"
    exit 1
    ;;
esac

echo "Bumping version: $CURRENT_VERSION -> $NEW_VERSION"

# Update package.json
node -e "
const fs = require('fs');
const pkg = require('./package.json');
pkg.version = '$NEW_VERSION';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# Commit, tag, and push
git add package.json
git commit -m "chore: Bump version to $NEW_VERSION"
git push
git tag "v$NEW_VERSION"
git push origin "v$NEW_VERSION"

echo ""
echo "✓ Released v$NEW_VERSION"
echo "  View release: https://github.com/raychaser/beadsx/releases/tag/v$NEW_VERSION"
echo "  View workflow: https://github.com/raychaser/beadsx/actions"
