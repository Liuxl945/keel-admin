#!/usr/bin/env bash
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_compose.sh"

"${COMPOSE[@]}" exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
