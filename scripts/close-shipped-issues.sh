#!/usr/bin/env bash
# Close SeedOcean checklist issues #1–#10 (requires a token with issues:write).
# Usage: ./scripts/close-shipped-issues.sh
#        GH_TOKEN=ghp_... ./scripts/close-shipped-issues.sh
set -euo pipefail

REPO="${REPO:-reed-soul/SeedOcean}"
PR_URL="${PR_URL:-https://github.com/reed-soul/SeedOcean/pull/12}"

close_done() {
  local n="$1"
  local body="$2"
  echo "Closing #$n …"
  gh issue close "$n" --repo "$REPO" --reason completed --comment "$body"
}

close_done 1 "Shipped: WebGPU FFT/JONSWAP engine on master. See $PR_URL."
close_done 2 "Shipped: clipmap + FFT displacement mesh on master. See $PR_URL."
close_done 3 "Shipped: PBR/TSL water material (SSS, refraction, reflection, cel). See $PR_URL."
close_done 4 "Shipped: persistent/advected foam field. See $PR_URL."
close_done 5 "Shipped: underwater post + caustics + Snell's window. See $PR_URL."
close_done 6 "Shipped: open-ocean presets + Mountain Lake (\`lake\`). See $PR_URL."
close_done 7 "Shipped: \`exportGLB\` / Export .glb in demo. See $PR_URL."
close_done 8 "Shipped: lil-gui control panel (+ shoreline brush). See $PR_URL."
close_done 9 "Shipped: multi-body buoyancy + wake field. See $PR_URL."
close_done 10 "Shipped: River + Pool on master; Coastal Surf (\`surf\`, waterType \`coast\`) in $PR_URL."

echo "All done."
