#!/usr/bin/env bash
# Creates the Coolify project and the Docker Compose application that serve
# the live demo, through the Coolify REST API. Safe to re-run: an existing
# project or application with the same name is reused, never duplicated.
#
# Needs curl and jq, plus an API token with the root ability, read from
# ~/.config/coolify/token (mode 600) or the COOLIFY_TOKEN variable. The token
# is only sent to COOLIFY_URL and is never printed.
set -euo pipefail

COOLIFY_URL="${COOLIFY_URL:-https://coolify.ozgurgurcan.com}"
TOKEN="${COOLIFY_TOKEN:-$(cat "${HOME}/.config/coolify/token")}"
SERVER_UUID="${SERVER_UUID:-t8ogc0ww44gkoo0044okkk4k}"
PROJECT_NAME="${PROJECT_NAME:-calculator-fullstack}"
APP_NAME="${APP_NAME:-calculator-fullstack}"
DOMAIN="${DOMAIN:-https://calculator.ozgurgurcan.com}"
REPO="${REPO:-https://github.com/zgrgrcn/calculator-fullstack}"

api() {
  curl -sS --fail-with-body \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" "$@"
}

project_uuid=$(api "${COOLIFY_URL}/api/v1/projects" | jq -r --arg n "${PROJECT_NAME}" '.[] | select(.name == $n) | .uuid')
if [ -z "${project_uuid}" ]; then
  body=$(jq -n --arg n "${PROJECT_NAME}" '{name: $n, description: "Go + React calculator, senior full-stack take-home. Live demo."}')
  project_uuid=$(api -X POST "${COOLIFY_URL}/api/v1/projects" -d "${body}" | jq -r .uuid)
  echo "created project ${project_uuid}"
else
  echo "project exists: ${project_uuid}"
fi

app_uuid=$(api "${COOLIFY_URL}/api/v1/applications" | jq -r --arg n "${APP_NAME}" '.[] | select(.name == $n) | .uuid' | head -n 1)
if [ -z "${app_uuid}" ]; then
  body=$(jq -n --arg p "${project_uuid}" --arg s "${SERVER_UUID}" --arg r "${REPO}" --arg d "${DOMAIN}" --arg n "${APP_NAME}" '{
    project_uuid: $p,
    server_uuid: $s,
    environment_name: "production",
    git_repository: $r,
    git_branch: "main",
    build_pack: "dockercompose",
    docker_compose_location: "/docker-compose.yml",
    docker_compose_domains: [{name: "frontend", domain: $d}],
    name: $n,
    description: "Compose stack: Go arithmetic API + nginx-served React keypad",
    instant_deploy: false,
    is_auto_deploy_enabled: false
  }')
  app_uuid=$(api -X POST "${COOLIFY_URL}/api/v1/applications/public" -d "${body}" | jq -r .uuid)
  echo "created application ${app_uuid}"
else
  echo "application exists: ${app_uuid}"
fi

webhook="${COOLIFY_URL}/api/v1/deploy?uuid=${app_uuid}&force=false"
echo
echo "Deploy webhook: ${webhook}"
echo "Next: gh secret set COOLIFY_WEBHOOK_URL --body '${webhook}'"
