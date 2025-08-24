# kras-trans-site

Static site for Kras-Trans.

## Build scripts

The officially supported build script lives in `tools/build.py`. It consumes
CMS data and writes the generated site to the `dist/` directory.

## CMS data

Menu labels must be unique within each language. During the build process,
duplicate labels trigger a warning and the later entries are ignored.

If `data/cms/menu.xlsx` is missing, the build script tries to fetch the sheet
from the location specified by the `CMS_SOURCE` environment variable. The value
may point to a local file path or an HTTP(S) URL. The downloaded file is cached
under `data/cms/menu.xlsx` for subsequent runs.

## Theme handling

The base template includes a tiny inline script that reads the saved theme from
`localStorage` and toggles `theme-dark` before CSS loads. This prevents a flash
of the wrong theme on initial page render. The same logic powers the theme
switcher in `templates/_partials/header.html`.

