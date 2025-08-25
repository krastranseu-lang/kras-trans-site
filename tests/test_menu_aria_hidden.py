from playwright.sync_api import sync_playwright


def test_menu_toggle_updates_visibility_and_a11y():
    html = """
    <!DOCTYPE html>
    <ul id='navList'>
      <li class='has-mega'>
        <button class='mega-toggle' aria-expanded='false' aria-controls='mega-a'>A</button>
        <div id='mega-a' class='mega' hidden aria-hidden='true'><a href='#'>link</a></div>
      </li>
    </ul>
    """
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.set_content(html)
        page.add_script_tag(path='assets/js/cms.js')
        # open
        page.click("button[aria-controls='mega-a']")
        assert page.get_attribute("button[aria-controls='mega-a']", 'aria-expanded') == 'true'
        assert page.get_attribute("#mega-a", 'hidden') is None
        assert page.get_attribute("#mega-a", 'aria-hidden') == 'false'
        # close
        page.click("button[aria-controls='mega-a']")
        assert page.get_attribute("button[aria-controls='mega-a']", 'aria-expanded') == 'false'
        assert page.get_attribute("#mega-a", 'hidden') == ''
        assert page.get_attribute("#mega-a", 'aria-hidden') == 'true'
        browser.close()

