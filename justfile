doit:
  npm run generate && \
    npm run test && \
    npm run build

reverse-proxy:
  caddy reverse-proxy --from http://localhost:8888 --to unix//var/run/docker.sock
