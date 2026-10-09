#!/usr/bin/env bash
# Launch script for TUDLOIKO Django Backend

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "⚙ Starting TUDLOIKO Django Backend on http://127.0.0.1:8000..."

cd "$PROJECT_ROOT"
./backend/venv/bin/python3 backend/manage.py runserver 127.0.0.1:8000
