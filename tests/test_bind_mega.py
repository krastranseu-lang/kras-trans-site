from playwright.sync_api import sync_playwright


def test_bind_mega_initial_and_dynamic():
    html = """
    <!DOCTYPE html>
    <ul id='navList'>
      <li class='has-mega'>
        <button class='mega-toggle' aria-expanded='false' aria-controls='mega-a'>A</button>
        <div id='mega-a' hidden aria-hidden='true'></div>
      </li>
    </ul>
    """
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.set_content(html)
        page.add_script_tag(path='assets/js/cms.js')
        page.click("button[aria-controls='mega-a']")
        assert page.get_attribute("button[aria-controls='mega-a']", 'aria-expanded') == 'true'
        assert page.get_attribute("#mega-a", 'hidden') is None
        assert page.get_attribute("#mega-a", 'aria-hidden') == 'false'
        page.evaluate("""
        document.getElementById('navList').innerHTML += `\n      <li class='has-mega'>\n        <button class='mega-toggle' aria-expanded='false' aria-controls='mega-b'>B</button>\n        <div id='mega-b' hidden aria-hidden='true'></div>\n      </li>`
        """)
        page.wait_for_selector("button[aria-controls='mega-b']")
        page.click("button[aria-controls='mega-b']")
        assert page.get_attribute("button[aria-controls='mega-b']", 'aria-expanded') == 'true'
        assert page.get_attribute("#mega-b", 'hidden') is None
        assert page.get_attribute("#mega-b", 'aria-hidden') == 'false'
        assert page.get_attribute("button[aria-controls='mega-a']", 'aria-expanded') == 'false'
        assert page.get_attribute("#mega-a", 'hidden') == ''
        assert page.get_attribute("#mega-a", 'aria-hidden') == 'true'
        browser.close()
