doit:
  npm run generate && \
    npm run test && \
    npm run build

# run by the release workflow: bumps package.json, tags and pushes both
bump-version level:
  #!/bin/bash

  set -euo pipefail

  # --no-git-tag-version keeps npm out of git; it only rewrites the version in
  # package.json and package-lock.json, leaving the dependency tree untouched
  npm version {{level}} --no-git-tag-version
  version=$(jq -r .version package.json)

  git add package.json package-lock.json
  git commit -m "version ${version}"
  git tag "${version}"
  git push --atomic origin main "${version}"

create-release:
  #!/bin/bash

  zip -r dist.zip package.json tsconfig.json README.md LICENSE dist src
  version=$(cat package.json | jq -r .version)
  gh release create "${version}" dist.zip \
    --verify-tag \
    --title "${version}" \
    --generate-notes \
    --repo manualpilot/docker-client-ts

reverse-proxy:
  caddy reverse-proxy --from http://localhost:8888 --to unix//var/run/docker.sock
