#!/bin/bash
set -e

echo "Starting information-flow backend..."

# Stop any existing backend
if [ -f ~/information-flow/backend/backend.pid ]; then
  PID=$(cat ~/information-flow/backend/backend.pid)
  if ps -p $PID > /dev/null; then
    echo "Stopping existing backend (PID: $PID)..."
    kill $PID
  fi
  rm ~/information-flow/backend/backend.pid
fi

# First, stop the Jupyter notebook that's using port 8080
JUPYTER_PID=$(ps aux | grep jupyter-notebook | grep 8080 | awk '{print $2}')
if [ ! -z "$JUPYTER_PID" ]; then
  echo "Stopping Jupyter notebook on port 8080 (PID: $JUPYTER_PID)..."
  kill $JUPYTER_PID
  sleep 2
fi

# Navigate to the project directory
cd ~/information-flow/backend

# Run the backend server using nohup to keep it running after SSH disconnects
# Using port 8080 which is already being forwarded by vast.ai
nohup python3 -m uvicorn attention.api:app --host 0.0.0.0 --port 8080 > backend.log 2>&1 &

# Save the process ID
echo $! > backend.pid

echo "Backend started on port 8080 (PID: $(cat backend.pid))"
echo "You can check the logs with: tail -f ~/information-flow/backend/backend.log" 