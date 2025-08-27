from playwright.sync_api import sync_playwright


def test_mega_toggle_aria_and_visibility():
    """Test that .mega-toggle sets aria attributes and visibility correctly."""
    html = """
    <!DOCTYPE html>
    <html lang="pl">
    <head>
        <meta charset="utf-8">
        <title>Mega Menu Test</title>
        <style>
            .mega { position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #ccc; }
            .mega[hidden] { display: none; }
            .mega-toggle { padding: 8px; border: 1px solid #ccc; background: white; cursor: pointer; }
            .has-mega { position: relative; }
        </style>
    </head>
    <body>
        <nav>
            <ul>
                <li class="has-mega">
                    <a href="/test" class="top-link">Test Menu</a>
                    <button class="mega-toggle" aria-expanded="false" aria-controls="mega-test">▾</button>
                    <div id="mega-test" class="mega" hidden aria-hidden="true">
                        <div class="mega__grid">
                            <a href="/item1" class="mega__link">Item 1</a>
                            <a href="/item2" class="mega__link">Item 2</a>
                        </div>
                    </div>
                </li>
                <li class="has-mega">
                    <a href="/test2" class="top-link">Test Menu 2</a>
                    <button class="mega-toggle" aria-expanded="false" aria-controls="mega-test2">▾</button>
                    <div id="mega-test2" class="mega" hidden aria-hidden="true">
                        <div class="mega__grid">
                            <a href="/item3" class="mega__link">Item 3</a>
                            <a href="/item4" class="mega__link">Item 4</a>
                        </div>
                    </div>
                </li>
            </ul>
        </nav>
    </body>
    </html>
    """
    
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.set_content(html)
        
        # Add the mega menu JavaScript
        page.add_script_tag(path='assets/js/cms.js')
        
        # Test initial state
        mega_toggle = page.locator("button[aria-controls='mega-test']")
        mega_panel = page.locator("#mega-test")
        
        assert mega_toggle.get_attribute("aria-expanded") == "false"
        assert mega_panel.get_attribute("hidden") == ""
        assert mega_panel.get_attribute("aria-hidden") == "true"
        
        # Test opening mega menu
        mega_toggle.click()
        
        assert mega_toggle.get_attribute("aria-expanded") == "true"
        assert mega_panel.get_attribute("hidden") is None
        assert mega_panel.get_attribute("aria-hidden") == "false"
        
        # Test that other mega menus are closed when one is opened
        mega_toggle2 = page.locator("button[aria-controls='mega-test2']")
        mega_panel2 = page.locator("#mega-test2")
        
        assert mega_toggle2.get_attribute("aria-expanded") == "false"
        assert mega_panel2.get_attribute("hidden") == ""
        assert mega_panel2.get_attribute("aria-hidden") == "true"
        
        # Test closing mega menu
        mega_toggle.click()
        
        assert mega_toggle.get_attribute("aria-expanded") == "false"
        assert mega_panel.get_attribute("hidden") == ""
        assert mega_panel.get_attribute("aria-hidden") == "true"
        
        # Test opening second mega menu
        mega_toggle2.click()
        
        assert mega_toggle2.get_attribute("aria-expanded") == "true"
        assert mega_panel2.get_attribute("hidden") is None
        assert mega_panel2.get_attribute("aria-hidden") == "false"
        
        # Test that first mega menu is now closed
        assert mega_toggle.get_attribute("aria-expanded") == "false"
        assert mega_panel.get_attribute("hidden") == ""
        assert mega_panel.get_attribute("aria-hidden") == "true"
        
        # Test escape key closes mega menu
        page.keyboard.press("Escape")
        
        assert mega_toggle2.get_attribute("aria-expanded") == "false"
        assert mega_panel2.get_attribute("hidden") == ""
        assert mega_panel2.get_attribute("aria-hidden") == "true"
        
        browser.close()


def test_mega_toggle_mobile_fullscreen():
    """Test that mega menu goes fullscreen on mobile devices."""
    html = """
    <!DOCTYPE html>
    <html lang="pl">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Mega Menu Mobile Test</title>
        <style>
            .mega { position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #ccc; }
            .mega[hidden] { display: none; }
            .mega-toggle { padding: 8px; border: 1px solid #ccc; background: white; cursor: pointer; }
            .has-mega { position: relative; }
            
            @media (max-width: 980px) {
                .mega {
                    position: fixed !important;
                    inset: 0 !important;
                    min-width: 100vw;
                    min-height: 100vh;
                    z-index: 3000;
                }
            }
        </style>
    </head>
    <body>
        <nav>
            <ul>
                <li class="has-mega">
                    <a href="/test" class="top-link">Test Menu</a>
                    <button class="mega-toggle" aria-expanded="false" aria-controls="mega-test">▾</button>
                    <div id="mega-test" class="mega" hidden aria-hidden="true">
                        <div class="mega__grid">
                            <a href="/item1" class="mega__link">Item 1</a>
                            <a href="/item2" class="mega__link">Item 2</a>
                        </div>
                    </div>
                </li>
            </ul>
        </nav>
    </body>
    </html>
    """
    
    with sync_playwright() as p:
        browser = p.chromium.launch()
        
        # Test desktop behavior
        page = browser.new_page(viewport={'width': 1200, 'height': 800})
        page.set_content(html)
        page.add_script_tag(path='assets/js/cms.js')
        
        mega_toggle = page.locator("button[aria-controls='mega-test']")
        mega_panel = page.locator("#mega-test")
        
        mega_toggle.click()
        
        # On desktop, mega should be positioned absolutely
        mega_box = mega_panel.bounding_box()
        assert mega_box is not None
        assert mega_box['y'] > 0  # Should be below the header
        
        # Test mobile behavior
        page_mobile = browser.new_page(viewport={'width': 375, 'height': 667})
        page_mobile.set_content(html)
        page_mobile.add_script_tag(path='assets/js/cms.js')
        
        mega_toggle_mobile = page_mobile.locator("button[aria-controls='mega-test']")
        mega_panel_mobile = page_mobile.locator("#mega-test")
        
        mega_toggle_mobile.click()
        
        # On mobile, mega should be positioned fixed and cover full screen
        mega_box_mobile = mega_panel_mobile.bounding_box()
        assert mega_box_mobile is not None
        assert mega_box_mobile['x'] == 0
        assert mega_box_mobile['y'] == 0
        assert mega_box_mobile['width'] >= 375  # Should cover full viewport width
        assert mega_box_mobile['height'] >= 667  # Should cover full viewport height
        
        browser.close()
