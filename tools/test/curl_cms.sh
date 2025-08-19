# FILE: tools/test/curl_cms.sh
#!/usr/bin/env bash
# Prosty test endpointu CMS (wymaga curl). Opcjonalnie: pipe do `jq` dla ładnego formatu.
set -euo pipefail

CMS_API_URL="https://script.google.com/macros/s/AKfycbyQcsU1wSCV6NGDQm8VIAGpZkL1rArZe1UZ5tutTkjJiKZtr4MjQZcDFzte26VtRJJ2KQ/exec"
CMS_API_KEY="kb6mWQJQ3hTtY0m1GQ7v2rX1pC5n9d8zA4s6L2u"
CMS_ENDPOINT="${CMS_API_URL}?key=${CMS_API_KEY}"

echo "[i] Pytam: ${CMS_ENDPOINT}"
curl -sS "${CMS_ENDPOINT}" || { echo "[!] Błąd połączenia"; exit 1; }

# Użyj tak, żeby ładnie sformatować:
#   ./tools/test/curl_cms.sh | jq .
