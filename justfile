tag:
  git tag -a $(cat package.json | jq -r .version) -m "version $(cat package.json | jq -r .version)"
  git push --tags
