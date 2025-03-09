#!/bin/bash

# Connect to the server and set up port forwarding for both 8080 and 80
# This allows you to access the backend via localhost:80
ssh -p 14924 root@172.219.157.164 -L 8080:localhost:8080 -L 80:localhost:80 