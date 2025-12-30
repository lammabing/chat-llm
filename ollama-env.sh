#!/bin/bash

# Cross-platform Ollama environment setup script
# Starts Ollama with proper CORS configuration for browser extensions
# Works on macOS, Linux, and Windows (with Git Bash/WSL)

MODE=$1

# Detect OS
OS="$(uname -s)"
case "${OS}" in
  Linux*)     OS_TYPE="linux" ;;
  Darwin*)    OS_TYPE="macos" ;;
  MINGW*|MSYS*|CYGWIN*) OS_TYPE="windows" ;;
  *)          OS_TYPE="unknown" ;;
esac

# Kill existing Ollama processes
if [ "$OS_TYPE" = "windows" ]; then
  taskkill //F //IM ollama.exe 2>/dev/null || true
else
  pkill -f "ollama serve" 2>/dev/null || true
fi

sleep 1

# Set host to 0.0.0.0 so LAN devices can access it
export OLLAMA_HOST="0.0.0.0"

# Get local IP address (cross-platform)
get_local_ip() {
  if [ "$OS_TYPE" = "macos" ]; then
    ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo ""
  elif [ "$OS_TYPE" = "linux" ]; then
    hostname -I 2>/dev/null | awk '{print $1}' || \
    ip -4 addr show | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1 2>/dev/null || echo ""
  elif [ "$OS_TYPE" = "windows" ]; then
    ipconfig 2>/dev/null | grep -i "IPv4" | head -1 | grep -oE '[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}' | head -1 || echo ""
  else
    echo ""
  fi
}

# Start Ollama based on mode
if [ "$MODE" = "firefox" ]; then
  export OLLAMA_ORIGINS="chrome-extension://*,moz-extension://*"
  nohup ollama serve > ~/.ollama-firefox.log 2>&1 &
  echo "✅ Ollama started with Firefox CORS + LAN access"
else
  nohup ollama serve > ~/.ollama-chrome.log 2>&1 &
  echo "✅ Ollama started with LAN access"
fi

sleep 2

LOCAL_IP=$(get_local_ip)

echo ""
echo "🌍 Access URLs:"
echo "   • http://localhost:11434"
if [ -n "$LOCAL_IP" ]; then
  echo "   • http://$LOCAL_IP:11434"
fi
echo ""

if [ "$OS_TYPE" = "windows" ]; then
  echo "💡 Tip: Ollama is running. To stop it, run:"
  echo "   taskkill //F //IM ollama.exe"
else
  echo "💡 Tip: Ollama is running in the background. To stop it, run:"
  echo "   pkill -f \"ollama serve\""
fi
echo ""
