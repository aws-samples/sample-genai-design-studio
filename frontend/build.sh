#!/bin/bash

# Frontend build script for VTO App
# This script builds the frontend with necessary environment variables

# Exit on error
set -e

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "Creating .env file with CDK output values..."
    cat > .env << EOF
# Auto-generated environment variables for VTO frontend
# These values will be replaced with actual CDK output values after deployment
VITE_APP_API_ENDPOINT=http://localhost:8000
VITE_APP_USER_POOL_ID=placeholder
VITE_APP_USER_POOL_CLIENT_ID=placeholder
VITE_APP_IDENTITY_POOL_ID=placeholder
VITE_APP_REGION=us-east-1
EOF
fi

echo "Installing dependencies..."
npm ci

echo "Building frontend (skipping type check)..."
npx vite build --mode production

echo "Frontend build completed successfully!"
echo "Build output is in the 'dist' directory"
