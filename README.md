# kras-trans-site

Static site for Kras-Trans.

## Build scripts

The officially supported build script lives in `tools/build.py`. It consumes
CMS data and writes the generated site to the `dist/` directory.

## CMS data

Menu labels must be unique within each language. During the build process,
duplicate labels trigger a warning and the later entries are ignored.

