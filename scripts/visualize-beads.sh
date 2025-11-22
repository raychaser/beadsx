#!/usr/bin/env bash
# Compact tree visualization of non-closed beads issues with dependencies
# Compatible with bash 3.2+

set -e

# Colors
BOLD='\033[1m'
DIM='\033[2m'
CYAN='\033[36m'
YELLOW='\033[33m'
RED='\033[31m'
GREEN='\033[32m'
MAGENTA='\033[35m'
BLUE='\033[34m'
RESET='\033[0m'

# Temp files for data storage
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Auto-detect prefix from existing issues
detect_prefix() {
    local sample_id=$(bd list --limit 1 2>/dev/null | grep -oE '^[a-zA-Z0-9_-]+-[a-z0-9]+' | head -1)
    if [ -n "$sample_id" ]; then
        # Extract prefix (everything before the last dash and ID)
        echo "$sample_id" | sed 's/-[a-z0-9]*$//'
    else
        echo "issue"  # fallback
    fi
}

PREFIX=$(detect_prefix)

# Get status color
status_color() {
    case "$1" in
        "open") echo "$CYAN" ;;
        "in_progress") echo "$YELLOW" ;;
        "blocked") echo "$RED" ;;
        "closed") echo "$GREEN" ;;
        *) echo "$RESET" ;;
    esac
}

# Get type badge
type_badge() {
    case "$1" in
        "epic") echo "${MAGENTA}[E]${RESET}" ;;
        "task") echo "${BLUE}[T]${RESET}" ;;
        "feature") echo "${CYAN}[F]${RESET}" ;;
        "bug") echo "${RED}[B]${RESET}" ;;
        "chore") echo "${DIM}[C]${RESET}" ;;
        *) echo "[?]" ;;
    esac
}

# Get all non-closed issue IDs
all_ids=$(bd list --status open --limit 100 2>/dev/null | grep -E "^\s*${PREFIX}-" | awk '{print $1}' || true)
all_ids+=" "$(bd list --status in_progress --limit 100 2>/dev/null | grep -E "^\s*${PREFIX}-" | awk '{print $1}' || true)
all_ids+=" "$(bd list --status blocked --limit 100 2>/dev/null | grep -E "^\s*${PREFIX}-" | awk '{print $1}' || true)

# Remove duplicates and sort
all_ids=$(echo "$all_ids" | tr ' ' '\n' | grep -v '^$' | sort -u)

# Parse each issue and save to temp files
for id in $all_ids; do
    details=$(bd show "$id" 2>/dev/null || continue)

    # Extract info and save to files
    echo "$details" | sed -n '2p' | sed "s/^$id: //" > "$TEMP_DIR/${id}.title"
    echo "$details" | grep "^Status:" | awk '{print $2}' > "$TEMP_DIR/${id}.status"
    echo "$details" | grep "^Type:" | awk '{print $2}' > "$TEMP_DIR/${id}.type"
    echo "$details" | grep "^Priority:" | awk '{print $2}' > "$TEMP_DIR/${id}.priority"

    # Extract dependencies and dependents
    echo "$details" | sed -n '/^Dependencies/,/^$/p' | grep -E '^\s+\[' | grep -oE "${PREFIX}-[a-z0-9]+" > "$TEMP_DIR/${id}.deps" 2>/dev/null || touch "$TEMP_DIR/${id}.deps"
    echo "$details" | sed -n '/^Dependents/,/^$/p' | grep -E '^\s+\[' | grep -oE "${PREFIX}-[a-z0-9]+" > "$TEMP_DIR/${id}.dependents" 2>/dev/null || touch "$TEMP_DIR/${id}.dependents"
done

# Function to print an issue with indentation
print_issue() {
    local id=$1
    local indent=$2
    local prefix=$3

    # Check if already visited
    if [ -f "$TEMP_DIR/${id}.visited" ]; then
        return
    fi
    touch "$TEMP_DIR/${id}.visited"

    # Read data from files
    local title=$(cat "$TEMP_DIR/${id}.title" 2>/dev/null || echo "Unknown")
    local status=$(cat "$TEMP_DIR/${id}.status" 2>/dev/null || echo "unknown")
    local type=$(cat "$TEMP_DIR/${id}.type" 2>/dev/null || echo "task")
    local priority=$(cat "$TEMP_DIR/${id}.priority" 2>/dev/null || echo "P3")

    # Filter out unknown status
    if [ "$status" = "unknown" ]; then
        return
    fi

    local color=$(status_color "$status")
    local type_badge=$(type_badge "$type")

    # Print the issue (one line)
    echo -e "${indent}${prefix}${color}${status}${RESET} ${type_badge} ${priority} ${BOLD}${id}${RESET} ${title}"

    # Print dependents recursively
    if [ -f "$TEMP_DIR/${id}.dependents" ]; then
        local dep_count=$(wc -l < "$TEMP_DIR/${id}.dependents" | tr -d ' ')
        if [ "$dep_count" -gt 0 ]; then
            local i=0
            while IFS= read -r dep_id; do
                [ -z "$dep_id" ] && continue
                i=$((i + 1))
                if [ $i -eq $dep_count ]; then
                    print_issue "$dep_id" "${indent}    " "└─ "
                else
                    print_issue "$dep_id" "${indent}    " "├─ "
                fi
            done < "$TEMP_DIR/${id}.dependents"
        fi
    fi
}

# Find root issues (no dependencies)
for id in $all_ids; do
    dep_count=$(wc -l < "$TEMP_DIR/${id}.deps" 2>/dev/null | tr -d ' ' || echo "0")
    if [ "$dep_count" -eq 0 ]; then
        print_issue "$id" "" ""
    fi
done

for id in $all_ids; do
    dep_count=$(wc -l < "$TEMP_DIR/${id}.deps" 2>/dev/null | tr -d ' ' || echo "0")
    if [ "$dep_count" -gt 0 ]; then
        # Skip if already visited
        if [ ! -f "$TEMP_DIR/${id}.visited" ]; then
            print_issue "$id" "" ""
        fi
    fi
done
