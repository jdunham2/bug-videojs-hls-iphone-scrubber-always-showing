#!/bin/sh
# Wraps game.html (page body, no document skeleton) into a standalone index.html.
cd "$(dirname "$0")"
{
  printf '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n'
  cat game.html
  printf '\n</body>\n</html>\n'
} > index.html
