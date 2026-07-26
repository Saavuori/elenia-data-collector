#!/bin/bash
set -e

REPO="Saavuori/elenia-data-collector"
BRANCH="main"
BASE_URL="https://raw.githubusercontent.com/${REPO}/${BRANCH}"
INSTALL_DIR="${1:-elenia-collector}"

echo "==> Installing Elenia Data Collector into ./${INSTALL_DIR}"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

echo "==> Downloading docker-compose.yml..."
curl -fsSL "${BASE_URL}/docker-compose.yml" -o docker-compose.yml

if [ ! -f credentials.json ]; then
  echo "==> Initializing empty credentials.json..."
  echo '{}' > credentials.json
fi

if [ ! -f influx_config.json ]; then
  echo "==> Initializing default influx_config.json..."
  cat << 'EOF' > influx_config.json
{
  "url": "http://localhost:8086",
  "token": "",
  "org": "",
  "bucket": "electricity",
  "enabled": false,
  "interval_minutes": 60
}
EOF
fi

echo "==> Checking docker network 'web-proxy'..."
if ! docker network inspect web-proxy >/dev/null 2>&1; then
  echo "==> Creating 'web-proxy' external docker network..."
  docker network create web-proxy
else
  echo "==> 'web-proxy' docker network already exists, skipping."
fi

echo ""
echo "==> Done! Next steps:"
echo "  1. Start the collector:  docker compose up -d"
echo "  2. Add the route to your caddy-proxy Caddyfile, then reload Caddy:"
echo "       redir /eleniadatacollector /eleniadatacollector/"
echo "       handle_path /eleniadatacollector* {"
echo "           reverse_proxy elenia-collector:3000"
echo "       }"
echo "     Open the Web UI at https://<your-domain>/eleniadatacollector/"
echo "  3. Log in with your Elenia Aina credentials via the Web UI"
echo ""
echo "  Not using a reverse proxy? Uncomment the 'ports' block in"
echo "  docker-compose.yml and browse to http://\$(hostname -I | awk '{print \$1}'):3001"
