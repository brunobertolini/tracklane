# Fonts for the social card

Inter 4.1, Regular and SemiBold, subset to Latin.

Not the site's fonts. The pages load Inter through `next/font`, which emits
woff2, and satori cannot read woff2 — it needs a raw `ttf` or `otf` buffer. So
the card carries its own copy of the same typeface.

They are read from disk rather than fetched, because the card is generated
during `next build`: a font pulled from a CDN makes the build fail on someone
else's outage, and makes it fail in CI first.

They live here rather than in `public/` on purpose. Nothing serves them, the
build only reads them, and putting them under `public/` would ship 90 kB to
every visitor for an image none of them will ever load.

## Reproducing them

```sh
curl -L -o inter.zip https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip
unzip -j inter.zip 'extras/ttf/Inter-Regular.ttf' 'extras/ttf/Inter-SemiBold.ttf' 'LICENSE.txt'

for weight in Regular SemiBold; do
  uvx --from fonttools pyftsubset "Inter-$weight.ttf" \
    --output-file="Inter-$weight.ttf" \
    --unicodes='U+0020-007E,U+00A0-00FF,U+2010-2027,U+2030-205E,U+20AC' \
    --layout-features='kern,liga,calt' --no-hinting --desubroutinize
done
```

The subset is Latin, Latin-1 Supplement and general punctuation: 44 kB a weight
instead of 410 kB. A character outside that range renders as a blank box, so
widen the range before writing a card in a language that needs more.

`LICENSE.txt` is the SIL Open Font License the files are distributed under, and
it has to travel with them.
