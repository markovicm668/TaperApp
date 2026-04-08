export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-[980px] space-y-8 pb-16">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary/80">Legal</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-1 text-muted-foreground">Last updated: April 8, 2026</p>
      </div>

      <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">1. Introduction</h2>
          <p>
            Tailor ("we", "us", or "our") is committed to protecting your privacy. This Privacy
            Policy explains how we collect, use, and safeguard your information when you use our
            resume optimization service at trytailor.cv.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">2. Information We Collect</h2>
          <p>We collect the following categories of information:</p>
          <ul className="ml-4 list-disc space-y-1 pl-2">
            <li>
              <span className="font-medium text-foreground">Account information:</span> Name and
              email address obtained from Google Sign-In when you authenticate.
            </li>
            <li>
              <span className="font-medium text-foreground">User content:</span> Resume text, job
              descriptions, and other content you submit for analysis.
            </li>
            <li>
              <span className="font-medium text-foreground">Usage data:</span> Token balance,
              analysis history, and feature usage within the Service.
            </li>
            <li>
              <span className="font-medium text-foreground">Technical data:</span> Browser type, IP
              address, and usage analytics collected automatically via Vercel Analytics.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">3. How We Use Your Information</h2>
          <p>We use your information to:</p>
          <ul className="ml-4 list-disc space-y-1 pl-2">
            <li>Provide and operate the Service, including running AI-powered resume analysis</li>
            <li>Manage your account, token balance, and analysis history</li>
            <li>Respond to support requests and communications</li>
            <li>Monitor and improve Service performance and reliability</li>
            <li>Comply with legal obligations</li>
          </ul>
          <p className="mt-2">
            We do not sell your personal data to third parties. We do not use your resume content
            or job descriptions to train AI models.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">4. Third-Party Services</h2>
          <p>We use the following third-party services to operate Tailor:</p>
          <ul className="ml-4 list-disc space-y-1 pl-2">
            <li>
              <span className="font-medium text-foreground">Google (Firebase &amp; Authentication):</span>{' '}
              Handles user authentication and our backend database. Governed by Google&apos;s Privacy
              Policy.
            </li>
            <li>
              <span className="font-medium text-foreground">OpenAI / AI providers:</span> Resume
              content is sent to AI providers to generate analysis and suggestions. These providers
              process data under their respective privacy policies and data processing agreements.
            </li>
            <li>
              <span className="font-medium text-foreground">Vercel:</span> Hosts the frontend and
              collects anonymized performance and analytics data.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">5. Data Retention</h2>
          <p>
            We retain your account information and analysis history for as long as your account is
            active. You may delete your account at any time via the Settings page, after which your
            personal data will be removed within 30 days.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">6. Data Security</h2>
          <p>
            We use industry-standard security measures including encrypted data transmission (HTTPS)
            and Firebase security rules to protect your data. No method of transmission over the
            internet is completely secure, and we cannot guarantee absolute security.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">7. Your Rights</h2>
          <p>You have the right to:</p>
          <ul className="ml-4 list-disc space-y-1 pl-2">
            <li>Access the personal data we hold about you</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your account and associated data</li>
            <li>Object to processing of your data</li>
          </ul>
          <p className="mt-2">
            To exercise any of these rights, contact us at{' '}
            <a href="mailto:marko@trytailor.cv" className="text-primary underline-offset-4 hover:underline">
              marko@trytailor.cv
            </a>
            .
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">8. Cookies</h2>
          <p>
            We use session cookies necessary for authentication and to keep you signed in. We do not
            use advertising or tracking cookies. Analytics data collected by Vercel is anonymized
            and does not identify individual users.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">9. Children&apos;s Privacy</h2>
          <p>
            The Service is not directed to children under the age of 13. We do not knowingly collect
            personal information from children. If you believe a child has provided us with their
            information, please contact us and we will delete it promptly.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">10. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of significant
            changes via the email associated with your account. Continued use of the Service after
            updates constitutes acceptance of the revised Policy.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">11. Contact</h2>
          <p>
            If you have any questions or concerns about this Privacy Policy, please contact us at{' '}
            <a href="mailto:marko@trytailor.cv" className="text-primary underline-offset-4 hover:underline">
              marko@trytailor.cv
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
