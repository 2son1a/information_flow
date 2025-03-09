# Backend Deployment Guide

This document explains how to use the backend deployed on vast.ai with your Vercel frontend deployment.

## Backend Information

The backend is running on a vast.ai server with the following details:

- Server IP: 172.219.157.164
- SSH Port: 14924
- API URL: http://ssh8.vast.ai:18550

## Environment Configuration

To connect your Vercel deployment to the backend, you need to set the following environment variable in your Vercel project:

```
NEXT_PUBLIC_API_URL=http://ssh8.vast.ai:18550
```

You can set this in the Vercel dashboard under Project Settings > Environment Variables.

## Available Endpoints

The backend provides the following endpoints:

- `GET /health` - Check if the backend is running
- `GET /models` - List available models
- `POST /process` - Process text and return attention patterns

Example request to the process endpoint:

```json
{
  "text": "Hello world",
  "model_name": "gpt2-small"
}
```

## Managing the Backend

The backend is running on the vast.ai server and can be managed using the following scripts:

- `start_backend.sh` - Start or restart the backend
- `manage_backend.sh status` - Check the status of the backend
- `manage_backend.sh stop` - Stop the backend

To connect to the server:

```bash
ssh -p 14924 root@172.219.157.164
```

## Troubleshooting

If you encounter issues with the backend:

1. Check if the backend is running: `ssh -p 14924 root@172.219.157.164 "bash ~/manage_backend.sh status"`
2. Check the logs: `ssh -p 14924 root@172.219.157.164 "tail -f ~/information-flow/backend/backend.log"`
3. Restart the backend: `ssh -p 14924 root@172.219.157.164 "bash ~/start_backend.sh"`

## CORS Configuration

The backend is configured to accept requests from any origin. If you need to restrict this to specific domains, you can modify the CORS configuration in `backend/attention/api.py`. 