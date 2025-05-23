doit:
  npm run generate && \
    npm run test && \
    npm run build  # dist files interfere with jest

bump-version level:
  #!/bin/bash

  set -x

  this_version=$(cat package.json | jq -r .version)
  next_version=$(./node_modules/.bin/semver -i {{level}} ${this_version})

  jq ".version = \"${next_version}\"" package.json > package.temp.json
  mv package.temp.json package.json

  npm install
  git add package.json package-lock.json
  git commit -m "version ${next_version}"
  git tag $(cat package.json | jq -r .version)
  git push --atomic origin main $(cat package.json | jq -r .version)

create-release:
  #!/bin/bash

  zip -r dist.zip package.json tsconfig.json README.md LICENSE dist lib
  version=$(cat package.json | jq -r .version)
  gh release create "${version}" dist.zip \
    --verify-tag \
    --title "${version}" \
    --repo manualpilot/docker-client-ts

reverse-proxy:
  caddy reverse-proxy --from http://localhost:8888 --to unix//var/run/docker.sock
