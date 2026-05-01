import { useEffect } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

const Privacy = () => {
  useEffect(() => {
    document.title = "Privacy Policy — The Creatives Room";
  }, []);

  return (
    <div className="min-h-screen grain flex flex-col">
      <SiteHeader />
      <main className="container max-w-3xl py-16 flex-1">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-4">
          ⏵ Legal
        </p>
        <h1 className="font-display text-5xl md:text-6xl font-black tracking-tighter mb-10">
          Privacy Policy
        </h1>

        <div className="space-y-8 font-body text-base leading-relaxed text-foreground/90">
          <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest">
            Last updated: {new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}
          </p>

          <section className="space-y-3">
            <h2 className="font-display text-2xl font-bold tracking-tight">1. Who we are</h2>
            <p>
              The Creatives Room ("we", "us") runs a non-commercial archive of
              creative work for educational and inspirational purposes. This
              policy explains what data we collect when you use our website
              and how we use it.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-2xl font-bold tracking-tight">2. What we collect</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Account data</strong> — if you sign up, we store your
                email address and (optionally) the name and avatar provided by
                your sign-in provider (e.g. Google, Facebook).
              </li>
              <li>
                <strong>Content you submit</strong> — references, images, links,
                tags, notes and bookmarks you save to your collection.
              </li>
              <li>
                <strong>Usage data</strong> — anonymous page views, the pages
                you visit and time spent, used only to improve the site.
              </li>
              <li>
                <strong>Cookies</strong> — strictly-necessary cookies to keep
                you signed in. We do not use advertising cookies.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-2xl font-bold tracking-tight">3. How we use your data</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>To create and maintain your account.</li>
              <li>To save your collection and submissions.</li>
              <li>To moderate user-submitted content before it appears publicly.</li>
              <li>To understand how the site is used and improve it.</li>
            </ul>
            <p>We do not sell your data and we do not share it with third parties for marketing.</p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-2xl font-bold tracking-tight">4. Data storage & security</h2>
            <p>
              Your data is stored on secure, encrypted infrastructure provided
              by our hosting partners. Access is restricted by row-level
              security rules so that you can only read and modify your own
              data, except where content has been published to the public
              archive.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-2xl font-bold tracking-tight">5. Your rights</h2>
            <p>You can at any time:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Access, edit or delete the content you have submitted.</li>
              <li>Delete your account and associated data by contacting us.</li>
              <li>Request a copy of the personal data we hold about you.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-2xl font-bold tracking-tight">6. Copyright & educational use</h2>
            <p>
              The Creatives Room does not claim ownership of, or any rights to,
              the third-party creative work referenced on this site. All
              trademarks, brand names, films, campaigns and visuals belong to
              their respective owners and are reproduced here under fair-use /
              fair-dealing principles for non-commercial, educational and
              inspirational purposes only.
            </p>
            <p>
              If you are a rights holder and would like a piece of content
              removed, credited differently, or accompanied by a specific
              attribution, please contact us and we will action your request
              promptly.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-2xl font-bold tracking-tight">7. Contact</h2>
            <p>
              For any privacy or copyright question, please reach out via the
              contact details on our site. We aim to respond within a few
              working days.
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default Privacy;
