#!/usr/bin/env bash
set -euo pipefail
cd /Users/alex/paperclip
export PATH="/Users/alex/.npm-global/bin:$PATH"
exec pnpm dev:once
