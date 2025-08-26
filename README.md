# kras-trans-site

Static site for Kras-Trans.

## Build scripts

The officially supported build script lives in `tools/build.py`. It consumes
CMS data and writes the generated site to the `dist/` directory.

## CMS data

Menu labels must be unique within each language. During the build process,
duplicate labels trigger a warning and the later entries are ignored.

If `data/cms/menu.xlsx` is missing, the build script looks for the sheet at the
location specified by the `CMS_SOURCE` environment variable. The value may point
to a local file path or an HTTPS URL. The file is saved as
`data/cms/menu.xlsx` before the build proceeds.

## Skąd brać CMS

1. **A:** commit deterministic `data/cms/menu.xlsx` into the repo.
2. **B:** set `vars.CMS_SOURCE=https://…/CMS.xlsx` so the workflow fetches it via `curl`.
3. **C:** (optional) obtain the sheet from a GitHub Release asset via the API.

## Navigation menu

Client-side behaviour of the navigation menu is implemented in
`assets/js/cms.js`. This script is the sole menu handler used by the site.

## Theme handling

The base template includes a tiny inline script that reads the saved theme from
`localStorage` and toggles `theme-dark` before CSS loads. This prevents a flash
of the wrong theme on initial page render. The same logic powers the theme
switcher in `templates/_partials/header.html`.

