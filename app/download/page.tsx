import type { Metadata } from "next";
import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { Download, ShieldCheck } from "lucide-react";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/MarketingChrome";
import { verifyAuthToken } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Download Chronicle Android App | Chronicle X",
  description:
    "Download the official Chronicle X Android app (APK). Fast media tracking, real-time release push notifications, and offline access.",
  alternates: { canonical: "/download" },
};

const appDetails = {
  version: "1.0.4",
  versionCode: 5,
  size: "953 KB",
  minAndroid: "Android 8.0+ (Oreo or higher)",
  package: "com.vortexdevx.chronicle",
  filename: "chronicle.apk",
  downloadUrl: "/downloads/chronicle.apk",
};

export default async function DownloadPage() {
  const cookieStore = await cookies();
  const isAuthenticated = Boolean(
    verifyAuthToken(cookieStore.get("auth_token")?.value),
  );

  return (
    <div className="marketing-site simple-home">
      <MarketingHeader isAuthenticated={isAuthenticated} />

      <main>
        <section className="simple-hero">
          <div className="marketing-container simple-hero-grid">
            <div className="simple-hero-copy">
              <div className="download-app-header-badge">
                <Image
                  src="/icon.png"
                  alt="Chronicle X App Logo"
                  width={56}
                  height={56}
                  priority
                  style={{
                    borderRadius: "14px",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    boxShadow: "0 8px 24px rgba(242, 90, 82, 0.22)",
                  }}
                />
                <span className="simple-kicker">Native Android Experience</span>
              </div>
              <h1>Chronicle on your phone.</h1>
              <p>
                Get release alerts right on your home screen. Track anime episodes,
                manhwa chapters, donghua, and light novels on the go.
              </p>

              <div className="simple-actions">
                <a
                  className="marketing-button"
                  href={appDetails.downloadUrl}
                  download={appDetails.filename}
                >
                  <Download size={18} aria-hidden="true" />
                  Download Android APK
                </a>
                <Link
                  className="simple-text-link"
                  href={isAuthenticated ? "/library" : "/login"}
                >
                  {isAuthenticated ? "Open web library" : "Sign in to web"}
                </Link>
              </div>

              <small>
                Version {appDetails.version} · {appDetails.size} · Signed &amp; Verified
              </small>
            </div>

            <div className="simple-capability-panel" aria-label="App specifications">
              <header>
                <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "12px" }}>
                  <Image
                    src="/favicon.png"
                    alt="Chronicle Icon"
                    width={40}
                    height={40}
                    style={{ borderRadius: "10px" }}
                  />
                  <div>
                    <span>Official Release</span>
                    <strong>Chronicle Android</strong>
                  </div>
                </div>
                <small>v{appDetails.version}</small>
              </header>

              <dl>
                <div>
                  <dt>File size</dt>
                  <dd>{appDetails.size} (Lightweight)</dd>
                  <span>APK</span>
                </div>
                <div>
                  <dt>Compatibility</dt>
                  <dd>{appDetails.minAndroid}</dd>
                  <span>API 26+</span>
                </div>
                <div>
                  <dt>Notifications</dt>
                  <dd>FCM Push for new chapters &amp; episodes</dd>
                  <span>PUSH</span>
                </div>
                <div>
                  <dt>Security</dt>
                  <dd>RSA-2048 Signed release build</dd>
                  <span>PASS</span>
                </div>
              </dl>

              <footer>
                <ShieldCheck size={15} aria-hidden="true" /> Direct APK download from Chronicle
              </footer>
            </div>
          </div>
        </section>

        <section className="simple-section" aria-labelledby="install-guide-heading">
          <div className="marketing-container">
            <div className="simple-section-heading">
              <span>Quick setup</span>
              <h2 id="install-guide-heading">How to install the APK</h2>
              <p>Three quick steps to get Chronicle running on your Android device.</p>
            </div>

            <div className="simple-feature-list">
              <article>
                <span>01</span>
                <h3>Download the APK</h3>
                <p>
                  Tap the download button above to save <code>chronicle.apk</code> directly
                  to your device.
                </p>
              </article>
              <article>
                <span>02</span>
                <h3>Allow Installation</h3>
                <p>
                  Open the downloaded file. If prompted by Android, tap &quot;Settings&quot; and enable
                  &quot;Allow from this source&quot;.
                </p>
              </article>
              <article>
                <span>03</span>
                <h3>Sign in &amp; Enable Push</h3>
                <p>
                  Launch Chronicle, sign in to your account, and allow notification permissions to
                  get live release updates.
                </p>
              </article>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
