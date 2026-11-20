#!/usr/bin/env bash
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_compose.sh"

"${COMPOSE[@]}" logs -f postgres
