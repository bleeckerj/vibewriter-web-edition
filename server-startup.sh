#!/bin/bash
npx postcss vanilla/tailwind.css -o vanilla/tailwind-build.css
cd server
node index.js