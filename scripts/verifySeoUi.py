"""Browser smoke test for Chronicle's public SEO surfaces."""

from __future__ import annotations

import json
from pathlib import Path

from playwright.sync_api import sync_playwright


BASE_URL = "http://127.0.0.1:3100"
PUBLIC_PAGES = [
    "/",
]
REMOVED_TRACKER_PAGES = [
    "/anime-tracker",
    "/manhwa-tracker",
    "/donghua-tracker",
    "/light-novel-tracker",
]


def verify_page(page, path: str) -> dict[str, object]:
    response = page.goto(f"{BASE_URL}{path}", wait_until="networkidle")
    assert response is not None and response.status == 200, f"{path}: expected HTTP 200"
    assert page.locator("h1").count() == 1, f"{path}: expected one h1"

    canonical = page.locator('link[rel="canonical"]').get_attribute("href")
    expected = "https://chroniclex.vercel.app" + (path if path != "/" else "")
    assert canonical == expected, f"{path}: unexpected canonical {canonical!r}"

    robots = page.locator('meta[name="robots"]').get_attribute("content") or ""
    assert "index" in robots and "follow" in robots, f"{path}: not indexable"

    json_ld = page.locator('script[type="application/ld+json"]').all_text_contents()
    assert json_ld, f"{path}: missing JSON-LD"
    parsed = [json.loads(value) for value in json_ld]
    schema_nodes = [
        node
        for block in parsed
        for node in (block if isinstance(block, list) else [block])
    ]
    schema_types = {node.get("@type") for node in schema_nodes}
    required_types = {"WebSite", "SoftwareApplication"}
    assert required_types.issubset(schema_types), (
        f"{path}: missing schema types {required_types - schema_types}"
    )

    return {
        "path": path,
        "title": page.title(),
        "canonical": canonical,
        "schema_types": sorted(schema_types),
    }


def main() -> None:
    output_dir = Path("test-results/seo")
    output_dir.mkdir(parents=True, exist_ok=True)

    console_errors: list[str] = []
    page_errors: list[str] = []
    results: list[dict[str, object]] = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)

        desktop = browser.new_page(viewport={"width": 1440, "height": 1000})
        desktop.on(
            "console",
            lambda message: console_errors.append(message.text)
            if message.type == "error"
            else None,
        )
        desktop.on("pageerror", lambda error: page_errors.append(str(error)))

        for path in PUBLIC_PAGES:
            results.append(verify_page(desktop, path))

        desktop.goto(BASE_URL, wait_until="networkidle")
        desktop.screenshot(path=output_dir / "homepage-desktop.png", full_page=True)
        assert desktop.get_by_role("link", name="Sign in").first.is_visible()
        assert desktop.get_by_role("link", name="Create library").is_visible()
        assert desktop.locator(".simple-actions .marketing-button").is_visible()
        assert desktop.locator("#features").is_visible()

        assert not console_errors, f"public-page console errors: {console_errors}"
        assert not page_errors, f"public-page errors: {page_errors}"

        private_page = browser.new_page(viewport={"width": 1440, "height": 1000})
        home_response = private_page.goto(f"{BASE_URL}/home", wait_until="networkidle")
        assert home_response is not None and home_response.status == 200
        home_robots = (
            private_page.locator('meta[name="robots"]').get_attribute("content") or ""
        )
        assert "noindex" in home_robots, "/home: expected noindex"

        login_response = private_page.goto(f"{BASE_URL}/login", wait_until="networkidle")
        assert login_response is not None and login_response.status == 200
        login_robots = (
            private_page.locator('meta[name="robots"]').get_attribute("content") or ""
        )
        assert "noindex" in login_robots, "/login: expected noindex"
        auth_box = private_page.locator(".auth-container").bounding_box()
        input_box = private_page.locator('input[name="username"], input[type="text"]').bounding_box()
        assert auth_box is not None and auth_box["width"] >= 500, (
            f"desktop auth card remains squeezed: {auth_box}"
        )
        assert input_box is not None and input_box["width"] >= 400, (
            f"desktop auth input remains squeezed: {input_box}"
        )
        private_page.screenshot(path=output_dir / "login-desktop.png", full_page=True)

        register_response = private_page.goto(
            f"{BASE_URL}/login?mode=register", wait_until="networkidle"
        )
        assert register_response is not None and register_response.status == 200
        assert private_page.locator('input[type="email"]').is_visible()
        private_page.screenshot(path=output_dir / "register-desktop.png", full_page=True)
        private_page.close()

        mobile = browser.new_page(viewport={"width": 390, "height": 844})
        mobile.goto(BASE_URL, wait_until="networkidle")
        mobile.screenshot(path=output_dir / "homepage-mobile.png", full_page=True)
        dimensions = mobile.evaluate(
            "() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth })"
        )
        assert dimensions["scrollWidth"] <= dimensions["width"] + 1, (
            f"mobile horizontal overflow: {dimensions}"
        )
        assert mobile.get_by_role("heading", level=1).is_visible()

        mobile.goto(f"{BASE_URL}/login", wait_until="networkidle")
        mobile.screenshot(path=output_dir / "login-mobile.png", full_page=True)
        mobile_auth_box = mobile.locator(".auth-container").bounding_box()
        mobile_auth_dimensions = mobile.evaluate(
            "() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth })"
        )
        assert mobile_auth_dimensions["scrollWidth"] <= mobile_auth_dimensions["width"] + 1, (
            f"mobile auth horizontal overflow: {mobile_auth_dimensions}"
        )
        assert mobile_auth_box is not None, "mobile auth card is missing"
        assert mobile_auth_box["x"] >= 8, f"mobile auth card clips left: {mobile_auth_box}"
        assert mobile_auth_box["x"] + mobile_auth_box["width"] <= 382, (
            f"mobile auth card clips right: {mobile_auth_box}"
        )

        robots_response = mobile.request.get(f"{BASE_URL}/robots.txt")
        assert robots_response.ok
        robots_text = robots_response.text()
        assert "Sitemap: https://chroniclex.vercel.app/sitemap.xml" in robots_text
        assert "GPTBot" in robots_text and "PerplexityBot" in robots_text

        sitemap_response = mobile.request.get(f"{BASE_URL}/sitemap.xml")
        assert sitemap_response.ok
        sitemap_text = sitemap_response.text()
        for path in PUBLIC_PAGES:
            expected_url = "https://chroniclex.vercel.app" + (path if path != "/" else "/")
            assert expected_url in sitemap_text
        assert sitemap_text.count("<url>") == 1, "sitemap should contain only homepage"

        for removed_path in REMOVED_TRACKER_PAGES:
            removed_response = mobile.request.get(f"{BASE_URL}{removed_path}")
            assert removed_response.status == 404, (
                f"{removed_path}: expected removal with HTTP 404"
            )

        browser.close()

    print(
        json.dumps(
            {
                "pages": results,
                "mobile_homepage": dimensions,
                "mobile_auth": mobile_auth_dimensions,
                "desktop_auth_width": auth_box["width"] if auth_box else None,
                "mobile_auth_width": mobile_auth_box["width"] if mobile_auth_box else None,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
