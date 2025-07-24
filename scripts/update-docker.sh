#!/bin/bash

# Script for updating and restarting the application

set -e

echo "🔄 Pulling latest changes from git repository..."
git pull

echo "🛑 Stopping containers..."
docker compose down

echo "🏗️ Building and starting containers in background..."
docker-compose up --build -d

echo "📋 Showing logs..."
docker-compose logs --tail 100 app

echo "✅ Update complete!" 