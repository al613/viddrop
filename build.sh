#!/usr/bin/env bash
set -o errexit

npm install

python3 -m pip install --user -U yt-dlp

mkdir -p bin
cp "$(python3 -m site --user-base)/bin/yt-dlp" ./bin/yt-dlp
chmod +x ./bin/yt-dlp

./bin/yt-dlp --version