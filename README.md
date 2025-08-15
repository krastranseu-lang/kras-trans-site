# kras-trans-site

Static site for Kras-Trans.

## Build scripts

The officially supported build script lives in `tools/build.py`. It consumes
CMS data and writes the generated site to the `dist/` directory. Run it with
environment variables pointing at your Apps Script endpoint:

```bash
APPS_URL=<apps_script_url> APPS_KEY=<key> python tools/build.py
```

For local experiments a simplified variant is available at
`tools/build_local.py`. It uses the same `APPS_URL` and `APPS_KEY` variables and
also outputs to `dist/`.

