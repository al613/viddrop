#!/usr/bin/env bash
set -o errexit

npm install

python3 -m pip installx ./bin/yt-dlppython3 -m pip install --user -U yt-dlp

./bin/yt-dlp --version

mkdir -p bin
cp "$(python3 -m site --user-base)/bin/yt-dlp" ./bin/yt-dlp
