tag:
  git tag $(cat package.json | jq -r .version)
  git push --atomic origin main $(cat package.json | jq -r .version)
