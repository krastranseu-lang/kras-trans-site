from playwright.sync_api import sync_playwright


def test_dropdown_keyboard_navigation():
    html = """
    <!DOCTYPE html>
    <button id='langBtn' aria-expanded='false'>Lang</button>
    <div id='langsDd' aria-hidden='true'>
      <a href='#'>PL</a>
      <a href='#'>EN</a>
    </div>
    <script>
    const langBtn = document.getElementById('langBtn');
    const langDd = document.getElementById('langsDd');
    function openLangs(open){ langBtn.setAttribute('aria-expanded', String(open)); langDd.setAttribute('aria-hidden', String(!open)); }
    langBtn.addEventListener('click', ()=>{ const exp=langBtn.getAttribute('aria-expanded')==='true'; openLangs(!exp); });
    document.addEventListener('keydown', e=>{
      if(e.key==='Escape' && langBtn.getAttribute('aria-expanded')==='true'){
        openLangs(false); langBtn.focus();
      }
    });
    </script>
    """
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.set_content(html)
        page.focus('#langBtn')
        page.keyboard.press('Enter')
        assert page.get_attribute('#langBtn', 'aria-expanded') == 'true'
        assert page.get_attribute('#langsDd', 'aria-hidden') == 'false'
        page.keyboard.press('Escape')
        assert page.get_attribute('#langBtn', 'aria-expanded') == 'false'
        assert page.get_attribute('#langsDd', 'aria-hidden') == 'true'
        assert page.evaluate('document.activeElement.id') == 'langBtn'
        browser.close()
