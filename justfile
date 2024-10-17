bump-version level:
  #!/bin/bash

  this_version=$(cat package.json | jq -r .version)
  next_version=$(./node_modules/.bin/semver -i {{level}} ${this_version})

  jq ".version = \"${next_version}\"" package.json > package.temp.json
  mv package.temp.json package.json

  git add package.json
  git commit -n "version ${next_version}"
  git tag $(cat package.json | jq -r .version)
  git push --atomic origin main $(cat package.json | jq -r .version)
