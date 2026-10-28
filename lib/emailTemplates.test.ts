import { describe, expect, it } from "vitest";
import { renderVerificationEmail, escapeHtml, getBrandLogoUrl } from "./emailTemplates";

describe("emailTemplates", () => {
  it("escapes html special characters", () => {
    expect(escapeHtml('<script>alert("xss")&\'test\'</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&amp;&#039;test&#039;&lt;/script&gt;",
    );
  });

  it("resolves brand logo url correctly", () => {
    expect(getBrandLogoUrl()).toBe("https://chroniclex.vercel.app/icon.png");
    expect(getBrandLogoUrl("https://my-domain.com")).toBe("https://my-domain.com/icon.png");
    expect(getBrandLogoUrl("http://localhost:3000")).toBe("https://chroniclex.vercel.app/icon.png");
  });

  it("renders welcome & verification email matching website branding", () => {
    const email = renderVerificationEmail({
      username: "OtakuKing",
      email: "otaku@example.com",
      verifyUrl: "https://chroniclex.vercel.app/api/auth/verify-email?token=xyz123",
      isWelcome: true,
    });

    expect(email.subject).toContain("Welcome to Chronicle");
    expect(email.subject).toContain("OtakuKing");
    expect(email.html).toContain("Welcome aboard");
    expect(email.html).toContain("OtakuKing");
    expect(email.html).toContain("CHRONICLE");
    expect(email.html).toContain("https://chroniclex.vercel.app/icon.png");
    expect(email.html).toContain("https://chroniclex.vercel.app/api/auth/verify-email?token=xyz123");
    expect(email.html).toContain("Verify Email & Get Started");
    expect(email.html).toContain("Anime &bull; Manhwa &bull; Donghua &bull; Light Novels");
    expect(email.text).toContain("https://chroniclex.vercel.app/api/auth/verify-email?token=xyz123");
    expect(email.text).toContain("OtakuKing");
  });

  it("renders resend verification email matching website branding", () => {
    const email = renderVerificationEmail({
      username: "NovelReader",
      email: "reader@example.com",
      verifyUrl: "https://chroniclex.vercel.app/api/auth/verify-email?token=abc456",
      isWelcome: false,
    });

    expect(email.subject).toBe("Verify your email address for Chronicle");
    expect(email.html).toContain("Verify your email");
    expect(email.html).toContain("NovelReader");
    expect(email.html).toContain("CHRONICLE");
    expect(email.html).toContain("https://chroniclex.vercel.app/icon.png");
    expect(email.html).toContain("https://chroniclex.vercel.app/api/auth/verify-email?token=abc456");
    expect(email.html).toContain("Verify Email Address");
    expect(email.text).toContain("Verify your Chronicle email, NovelReader");
    expect(email.text).toContain("https://chroniclex.vercel.app/api/auth/verify-email?token=abc456");
  });
});
