#!/bin/bash

# Release script for qbo-migrate.
#
# Runs locally. In CI, the release job in .github/workflows/ci.yml calls
# `pnpm run semantic-release` directly and does not use this script.
#
# Flow: check GitHub token -> lint -> type-check -> build -> test -> semantic-release.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}qbo-migrate release script${NC}"
echo "=================================="

# Function to check if a GitHub token is set in the environment.
# semantic-release needs it to publish GitHub releases and comment on issues.
check_token() {
    if [[ -n "$GH_TOKEN" ]]; then
        echo -e "${GREEN}[ok] GH_TOKEN is set${NC}"
        export GITHUB_TOKEN="$GH_TOKEN"
        return 0
    elif [[ -n "$GITHUB_TOKEN" ]]; then
        echo -e "${GREEN}[ok] GITHUB_TOKEN is set${NC}"
        return 0
    else
        echo -e "${RED}[x] No GitHub token found${NC}"
        echo "Set GH_TOKEN or GITHUB_TOKEN in your environment before running this script."
        exit 1
    fi
}

# Parse command line arguments
DRY_RUN=false
FORCE_CI=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --force-ci)
            FORCE_CI=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --dry-run         Run semantic-release in dry-run mode (no publish)"
            echo "  --force-ci        Force CI mode (sets CI=true so semantic-release publishes)"
            echo "  --help, -h        Show this help message"
            echo ""
            echo "Environment:"
            echo "  GH_TOKEN or GITHUB_TOKEN   Required. Used by semantic-release for"
            echo "                             GitHub release creation."
            echo "  NPM_TOKEN                  Required for non-dry-run publishes to npm."
            exit 0
            ;;
        *)
            echo -e "${RED}[x] Unknown option: $1${NC}"
            echo "Run with --help for usage."
            exit 1
            ;;
    esac
done

check_token

if [[ "$FORCE_CI" == "true" ]] && [[ -z "$CI" ]]; then
    echo -e "${YELLOW}Forcing CI mode for actual release${NC}"
    export CI=true
fi

echo ""
echo -e "${BLUE}Release configuration:${NC}"
echo "  CI mode: ${CI:-false}"
echo "  Dry run: $DRY_RUN"
echo ""

echo -e "${BLUE}Running lint...${NC}"
pnpm run lint

echo -e "${BLUE}Running type-check...${NC}"
pnpm run type-check

echo -e "${BLUE}Building...${NC}"
pnpm run build

echo -e "${BLUE}Running tests...${NC}"
pnpm test

echo -e "${BLUE}Running semantic-release...${NC}"
if [[ "$DRY_RUN" == "true" ]]; then
    pnpm semantic-release --dry-run
else
    pnpm semantic-release
fi

echo ""
echo -e "${GREEN}[ok] Release process completed${NC}"
