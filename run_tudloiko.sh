#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
#  TUDLOIKO — AI Interview Copilot  |  Full Stack Launch Script
#  Usage: ./run_tudloiko.sh
# ─────────────────────────────────────────────────────────────────

set -e

# ── Colors ────────────────────────────────────────────────────────
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
RESET='\033[0m'
BOLD='\033[1m'

# ── Banner ────────────────────────────────────────────────────────
echo ""
echo -e "${PURPLE}${BOLD}"
echo "  ████████╗██╗   ██╗██████╗ ██╗      ██████╗ ██╗██╗  ██╗ ██████╗ "
echo "     ██╔══╝██║   ██║██╔══██╗██║     ██╔═══██╗██║██║ ██╔╝██╔═══██╗"
echo "     ██║   ██║   ██║██║  ██║██║     ██║   ██║██║█████╔╝ ██║   ██║"
echo "     ██║   ██║   ██║██║  ██║██║     ██║   ██║██║██╔═██╗ ██║   ██║"
echo "     ██║   ╚██████╔╝██████╔╝███████╗╚██████╔╝██║██║  ██╗╚██████╔╝"
echo "     ╚═╝    ╚═════╝ ╚═════╝ ╚══════╝ ╚═════╝ ╚═╝╚═╝  ╚═╝ ╚═════╝ "
echo -e "${RESET}"
echo -e "  ${CYAN}AI Interview Copilot — Desktop Overlay + Django Backend${RESET}"
echo -e "  ${PURPLE}─────────────────────────────────────────────────────────${RESET}"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── 1. Check Node.js ──────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo -e "${RED}✗ Node.js is not installed.${RESET}"
  echo -e "  Install it from https://nodejs.org/ (v18+ required)"
  exit 1
fi
echo -e "  ${GREEN}✓${RESET} Node.js $(node -v) detected"

# ── 2. Check Python ───────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
  echo -e "${RED}✗ Python3 is not installed.${RESET}"
  exit 1
fi
echo -e "  ${GREEN}✓${RESET} Python $(python3 --version) detected"

# ── 3. Install Node dependencies if missing ───────────────────────
if [ ! -d "node_modules" ]; then
  echo -e "  ${YELLOW}⚙ node_modules not found — running npm install...${RESET}"
  npm install --legacy-peer-deps
  echo -e "  ${GREEN}✓${RESET} Frontend dependencies installed"
fi

# ── 4. Start Django Backend in Background ─────────────────────────
if [ -d "backend" ]; then
  if [ ! -d "backend/venv" ]; then
    echo -e "  ${YELLOW}⚙ Creating Python virtualenv for Django backend...${RESET}"
    python3 -m venv backend/venv
    ./backend/venv/bin/pip install -r backend/requirements.txt
    ./backend/venv/bin/python3 backend/manage.py makemigrations api
    ./backend/venv/bin/python3 backend/manage.py migrate
  fi

  echo -e "  ${GREEN}🚀 Starting Django backend server on http://127.0.0.1:8000...${RESET}"
  ./backend/venv/bin/python3 backend/manage.py runserver 127.0.0.1:8000 > /dev/null 2>&1 &
  BACKEND_PID=$!

  # Clean up backend process on exit
  trap "echo ''; echo '  🛑 Stopping Django backend...'; kill $BACKEND_PID 2>/dev/null || true" EXIT
fi

# ── 5. Launch Electron App ─────────────────────────────────────────
echo ""
echo -e "  ${PURPLE}★${RESET} ${BOLD}Starting TUDLOIKO Overlay...${RESET}"
echo -e "  ${CYAN}Hotkey: Ctrl+Shift+H to hide/show the overlay${RESET}"
echo ""

npm run dev
