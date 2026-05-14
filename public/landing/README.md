# ClipX Landing Pages

Static landing pages for ClipX, styled with Tailwind CSS and served as plain HTML.

## Build CSS

Run this from the repo root:

npx.cmd tailwindcss -c public/landing/tailwind.config.cjs -i public/landing/tailwind.css -o public/landing/landing.css --minify

## Update the download URL

Set the href attribute on the primary download buttons in index.html.
