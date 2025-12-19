#!/bin/bash
set -e

# Annex Encoder-Only Entrypoint
# Requires ANNEX_SERVER_URL to connect to Annex server

echo "[Encoder] Encoder-only mode"

# Verify ANNEX_SERVER_URL is set
if [ -z "$ANNEX_SERVER_URL" ]; then
  echo "[Encoder] ERROR: ANNEX_SERVER_URL environment variable is required"
  echo "[Encoder] Example: ANNEX_SERVER_URL=ws://annex-server:3000/encoder"
  exit 1
fi

echo "[Encoder] Connecting to server: $ANNEX_SERVER_URL"

# Set defaults
export ANNEX_ENCODER_ID="${ANNEX_ENCODER_ID:-encoder-1}"
export ANNEX_ENCODER_NAME="${ANNEX_ENCODER_NAME:-Docker Encoder}"
export ANNEX_MAX_CONCURRENT="${ANNEX_MAX_CONCURRENT:-1}"
export ANNEX_LOG_LEVEL="${ANNEX_LOG_LEVEL:-info}"

# Detect GPU availability
if [ -e "/dev/dri/renderD128" ]; then
  echo "[Encoder] GPU detected at /dev/dri/renderD128"
  export ANNEX_GPU_DEVICE="/dev/dri/renderD128"

  # Test VAAPI support
  if command -v vainfo &> /dev/null; then
    echo "[Encoder] Testing VAAPI support..."
    vainfo --display drm --device /dev/dri/renderD128 || echo "[Encoder] Warning: VAAPI test failed, will fall back to CPU encoding"
  fi
else
  echo "[Encoder] No GPU detected, using CPU encoding (libsvtav1)"
fi

echo "[Encoder] Configuration:"
echo "  ID: $ANNEX_ENCODER_ID"
echo "  Name: $ANNEX_ENCODER_NAME"
echo "  Max Concurrent: $ANNEX_MAX_CONCURRENT"
echo "  Log Level: $ANNEX_LOG_LEVEL"

# Handle shutdown gracefully
cleanup() {
  echo "[Encoder] Shutting down..."
  exit 0
}

trap cleanup SIGTERM SIGINT

# Start encoder
echo "[Encoder] Starting encoder..."
cd /app/encoder
exec bun src/index.ts
