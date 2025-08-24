# kras-trans-site

Static site for Kras-Trans.

## Build scripts

The officially supported build script lives in `tools/build.py`. It consumes
CMS data and writes the generated site to the `dist/` directory.

## CMS data

Menu labels must be unique within each language. During the build process,
duplicate labels trigger a warning and the later entries are ignored.

If the GitHub Actions runner cannot find a CMS Excel file, the workflow now
creates an empty placeholder at `data/cms/menu.xlsx` and continues. This allows
builds and tests to run without a private CMS source, though generated content
will be minimal.

