#!/bin/bash
set -e

echo "Setting up information-flow backend..."

# Update system and install dependencies
apt-get update
apt-get install -y python3 python3-pip git

# Navigate to the project directory
cd ~/information-flow/backend

# Install Python dependencies
pip install -r requirements.txt

# Create a systemd service file for the backend
cat > /etc/systemd/system/information-flow-backend.service << EOL
[Unit]
Description=Information Flow Backend
After=network.target

[Service]
User=root
WorkingDirectory=/root/information-flow/backend
ExecStart=/usr/bin/python3 -m uvicorn attention.api:app --host 0.0.0.0 --port 8080
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOL

# Reload systemd, enable and start the service
systemctl daemon-reload
systemctl enable information-flow-backend
systemctl start information-flow-backend
systemctl status information-flow-backend

echo "Backend setup complete! The service should be running on port 8080" 