<!-- FILE: docs/cms.md -->
# CMS (Google Apps Script) – co nam to daje?

**Endpoint**  
`CMS_ENDPOINT = "https://script.google.com/macros/s/…/exec?key=kb6m…L2u"`

To publiczny URL naszego skryptu Apps Script, który zwraca **JSON z treścią serwisu**. `key=` to **token dostępu do odczytu** tego skryptu (nie Google Cloud API key).

## Zalety
- **Jedno źródło prawdy** dla treści → spójność na stronie i w generatorze.
- **Szybkie edycje**: zmieniasz w CMS, front pobierze świeże dane (cache 1 h).
- **Bezpieczeństwo praktyczne**: endpoint tylko do odczytu; w razie potrzeby obracamy klucz.
- **Odporność**: gdy sieć padnie → dane z cache; gdy brak cache → awaryjnie `data/strings.json`.

## Jak używać w HTML
```html
<link rel="preconnect" href="https://script.google.com">
<script src="/assets/js/cms.js" defer
        data-api="https://script.google.com/macros/s/AKfycbyQcsU1wSCV6NGDQm8VIAGpZkL1rArZe1UZ5tutTkjJiKZtr4MjQZcDFzte26VtRJJ2KQ/exec?key=kb6mWQJQ3hTtY0m1GQ7v2rX1pC5n9d8zA4s6L2u"></script>
<script defer>
  KTCMS.get().then(({data}) => {
    // przykład: wstrzyknięcie tytułu strony głównej
    const h1 = document.querySelector('[data-kt-bind="home.title"]');
    if (h1 && data?.pages?.home?.title) h1.textContent = data.pages.home.title;
  });
</script>
