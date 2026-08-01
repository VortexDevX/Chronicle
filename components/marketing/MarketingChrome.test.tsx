import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  LandingFinalAction,
  LandingHeroActions,
  MarketingHeaderActions,
} from "./MarketingChrome";

describe("landing page session actions", () => {
  it("shows sign-in and registration actions to guests", () => {
    const markup = renderToStaticMarkup(
      <>
        <MarketingHeaderActions isAuthenticated={false} />
        <LandingHeroActions isAuthenticated={false} />
        <LandingFinalAction isAuthenticated={false} />
      </>,
    );

    expect(markup).toContain('href="/login"');
    expect(markup).toContain('href="/login?mode=register"');
    expect(markup).toContain("Sign in");
    expect(markup).toContain("Create library");
    expect(markup).not.toContain('href="/library"');
  });

  it("shows home and library actions to authenticated users", () => {
    const markup = renderToStaticMarkup(
      <>
        <MarketingHeaderActions isAuthenticated />
        <LandingHeroActions isAuthenticated />
        <LandingFinalAction isAuthenticated />
      </>,
    );

    expect(markup).toContain('href="/home"');
    expect(markup).toContain('href="/library"');
    expect(markup).toContain("Open library");
    expect(markup).toContain("Open your library");
    expect(markup).not.toContain("Sign in");
    expect(markup).not.toContain("Create library");
  });
});
