tag:
  git tag $(cat package.json | jq -r .version)
  git push --tags
