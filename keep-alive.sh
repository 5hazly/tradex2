#!/bin/bash
cd /home/z/my-project
while true; do
  if ! curl -s -o /dev/null -w "" --connect-timeout 2 http://localhost:3000 2>/dev/null; then
    fuser -k 3000/tcp 2>/dev/null
    sleep 1
    NODE_ENV=production node .next/standalone/server.js > /dev/null 2>&1 &
    sleep 3
  fi
  sleep 5
done
