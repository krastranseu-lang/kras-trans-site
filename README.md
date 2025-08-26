# kras-trans-site

Static site for Kras-Trans.

## Build scripts

The officially supported build script lives in `tools/build.py`. It consumes
CMS data and writes the generated site to the `dist/` directory.

## CMS data

Menu labels must be unique within each language. During the build process,
duplicate labels trigger a warning and the later entries are ignored.

The build script requires `data/cms/menu.xlsx` to be present in the repository
and exits with an error if the file is missing.

## Skąd brać CMS

Commit deterministic `data/cms/menu.xlsx` into the repo.

## Navigation menu

Client-side behaviour of the navigation menu is implemented in
`assets/js/cms.js`. This script is the sole menu handler used by the site.

## Theme handling

The base template includes a tiny inline script that reads the saved theme from
`localStorage` and toggles `theme-dark` before CSS loads. This prevents a flash
of the wrong theme on initial page render. The same logic powers the theme
switcher in `templates/_partials/header.html`.
