#!/bin/bash

function status() {
  if [ -f ~/information-flow/backend/backend.pid ]; then
    PID=$(cat ~/information-flow/backend/backend.pid)
    if ps -p $PID > /dev/null; then
      echo "Backend is running (PID: $PID)"
      echo "You can check the logs with: tail -f ~/information-flow/backend/backend.log"
    else
      echo "Backend is not running (stale PID file exists)"
    fi
  else
    echo "Backend is not running"
  fi
}

function stop() {
  if [ -f ~/information-flow/backend/backend.pid ]; then
    PID=$(cat ~/information-flow/backend/backend.pid)
    if ps -p $PID > /dev/null; then
      echo "Stopping backend (PID: $PID)..."
      kill $PID
      rm ~/information-flow/backend/backend.pid
      echo "Backend stopped"
    else
      echo "Backend is not running (removing stale PID file)"
      rm ~/information-flow/backend/backend.pid
    fi
  else
    echo "Backend is not running"
  fi
}

case "$1" in
  status)
    status
    ;;
  stop)
    stop
    ;;
  *)
    echo "Usage: $0 {status|stop}"
    exit 1
    ;;
esac 