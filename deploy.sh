#!/bin/bash
set -e

SERVER="lexamServer"
REMOTE_DIR="~/lexam_data_pipeline"

echo "Deploying to $SERVER..."

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: You have uncommitted changes. Commit them first before deploying."
  git status --short
  exit 1
fi

# Push local changes first
echo "Pushing local changes..."
git push

# SSH into server: pull latest code, rebuild and restart containers
echo "Updating server..."
ssh "$SERVER" bash -s <<'EOF'
  set -e
  cd ~/lexam_data_pipeline

  echo "Pulling latest code..."
  git pull

  echo "Rebuilding and restarting containers..."
  docker compose -f docker-compose.prod.yml up -d --build

  echo "Cleaning up old images..."
  docker image prune -f

  echo "Done! Container status:"
  docker ps
EOF

echo "Deployment complete!"
