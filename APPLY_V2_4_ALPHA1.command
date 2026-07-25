#!/bin/bash
set -Eeuo pipefail
cd "$(dirname "$0")"
node scripts/finalize-v2.4.0-alpha.1.cjs
printf '\nChris Studio v2.4.0-alpha.1 overlay finalized.\n'
printf 'Next: npm ci --prefix apps/desktop/ui --legacy-peer-deps --no-audit --no-fund\n'
printf 'Then: npm --prefix apps/desktop/ui run typecheck && npm --prefix apps/desktop/ui run test:core && npm --prefix apps/desktop/ui run build\n'
