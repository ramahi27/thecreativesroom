import { useEffect } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

const Terms = () => {
  useEffect(() => {
    document.title = "Terms of Service — The Creatives Room";
  }, []);

  return (
    <div className="min-h-screen grain flex flex-col">
      <SiteHeader />
      <main className="container max-w-3xl py-16 flex-1">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-4">
          ⏵ Legal
        </p>
        <h1 className="font-display text-5xl md:text-6xl font-black tracking-tighter mb-10">
          Terms of Service
        </h1>

        <div className="space-y-8 font-body text-base leading-relaxed text-foreground/90">
          <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest">
            Last updated: {new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}
          </p>

          <section className="space-y-3">
            <h2 className="font-display text-2xl font-bold tracking-tight">1. About this service</h2>
            <p>
              The Creatives Room ("the Service", "we", "us") is a non-commercial,
              community-curated archive of creative work, presented strictly for
              educational and inspirational purposes. By accessing or using the
              Service you agree to these Terms of Service ("Terms"). If you do
              not agree, please do not use the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-2xl font-bold tracking-tight">2. Eligibility & accounts</h2>
            <p>
              You must be at least 13 years old to create an account. You are
              responsible for the activity under your account and for keeping
              your credentials secure. We may suspend or terminate accounts that
              violate these Terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-2xl font-bold tracking-tight">3. User-submitted content</h2>
            <p>
              When you submit references (images, links, notes, tags) you confirm
              that your submission is intended for non-commercial educational use
              and that, to the best of your knowledge, it does not infringe any
              third-party rights. Photo uploads only — videos are not accepted
              from contributors.
            </p>
            <p>
              You grant us a non-exclusive, worldwide, royalty-free licence to
              host, display and distribute your submissions within the Service
              for the purposes described above. You can request removal of your
              submissions at any time.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-2xl font-bold tracking-tight">4. Intellectual property & fair use</h2>
            <p>
              All featured work, trademarks, brand names and visuals remain the
              property of their respective owners. We do not claim ownership of
              the projects shown. Content is shared under principles of fair use
              / fair dealing for commentary, criticism, education and research.
            </p>
            <p>
              If you are a rights holder and would like a piece removed or
              credited differently, please contact us and we will act promptly.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-2xl font-bold tracking-tight">5. Acceptable use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>upload unlawful, hateful, harassing, or sexually explicit content;</li>
              <li>upload malware or attempt to compromise the Service;</li>
              <li>scrape, resell, or commercially redistribute the archive;</li>
              <li>misrepresent authorship or impersonate others.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-2xl font-bold tracking-tight">6. Moderation</h2>
            <p>
              We may, at our sole discretion, edit, hide, or remove any content,
              and approve or reject submissions for public display. Submissions
              are private to your collection until an admin approves them for
              public listing.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-2xl font-bold tracking-tight">7. Disclaimer & liability</h2>
            <p>
              The Service is provided "as is", without warranties of any kind.
              To the fullest extent permitted by law, we are not liable for any
              indirect, incidental, or consequential damages arising from your
              use of the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-2xl font-bold tracking-tight">8. Changes</h2>
            <p>
              We may update these Terms from time to time. Continued use of the
              Service after changes are posted constitutes acceptance of the
              updated Terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-2xl font-bold tracking-tight">9. Contact</h2>
            <p>
              For takedown requests, account questions, or any other enquiry,
              please reach out via the contact channel listed on the site.
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default Terms;
