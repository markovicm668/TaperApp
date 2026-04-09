export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-[980px] space-y-8 pb-16">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary/80">Legal</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-1 text-muted-foreground">Last updated: April 9, 2026</p>
      </div>

      <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">1. Introduction</h2>
          <p>
            Tailor ("we", "us", or "our") is committed to protecting your privacy. This Privacy
            Policy explains how we collect, use, store, and safeguard your information when you use
            our resume optimization service at trytailor.cv. By using the Service, you agree to the
            practices described in this policy.
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

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">3. Google User Data</h2>
          <p>
            Tailor uses Google Sign-In (via Firebase Authentication) to create and manage your
            account. The following sections describe exactly how we handle the data obtained through
            Google in compliance with the{' '}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              Google API Services User Data Policy
            </a>
            .
          </p>

          <div className="space-y-2">
            <h3 className="font-medium text-foreground">3.1 Data Accessed</h3>
            <p>
              When you sign in with Google, we access only the following data from your Google
              account:
            </p>
            <ul className="ml-4 list-disc space-y-1 pl-2">
              <li>Your name (display name)</li>
              <li>Your email address</li>
              <li>Your Google account profile picture URL</li>
              <li>A unique identifier (UID) used to manage your account</li>
            </ul>
            <p>
              We do not access your Google Drive, Gmail, Calendar, Contacts, or any other Google
              services or data beyond basic profile information.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium text-foreground">3.2 Data Usage</h3>
            <p>The Google user data we access is used exclusively to:</p>
            <ul className="ml-4 list-disc space-y-1 pl-2">
              <li>Create and identify your Tailor account</li>
              <li>Display your name within the application</li>
              <li>Associate your resume analyses and token balance with your account</li>
              <li>Send account-related communications to your email address</li>
            </ul>
            <p>
              We do not use your Google data for advertising, profiling, or any purpose beyond
              operating the Service for you. We do not use Google user data to train AI or machine
              learning models.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium text-foreground">3.3 Data Sharing</h3>
            <p>
              We do not sell, rent, or share your Google user data with third parties for their own
              purposes. Your data is shared only in the following limited circumstances:
            </p>
            <ul className="ml-4 list-disc space-y-1 pl-2">
              <li>
                <span className="font-medium text-foreground">Firebase (Google):</span> Your account
                data is stored in Firebase Firestore and managed via Firebase Authentication, both
                operated by Google. Data is processed under Google&apos;s privacy terms.
              </li>
              <li>
                <span className="font-medium text-foreground">Vercel:</span> Hosts our frontend
                application. Vercel may process your IP address and browser metadata as part of
                serving the application.
              </li>
              <li>
                <span className="font-medium text-foreground">Legal requirements:</span> We may
                disclose your data if required by law or to protect the rights and safety of Tailor
                and its users.
              </li>
            </ul>
            <p>
              Your resume content and job descriptions submitted for analysis are sent to AI
              providers (such as OpenAI) solely to generate your results. These providers act as
              data processors and are contractually prohibited from using your data for their own
              purposes.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium text-foreground">3.4 Data Storage &amp; Protection</h3>
            <p>
              Your Google user data (name, email, UID) is stored in Google Firebase Firestore,
              which is protected by Google&apos;s enterprise-grade security infrastructure. All data
              is transmitted exclusively over HTTPS. Access to user data in our database is
              restricted by Firebase Security Rules and only accessible to authenticated users for
              their own records. We enforce the principle of least privilege: no part of the
              application accesses more data than is necessary.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium text-foreground">3.5 Data Retention &amp; Deletion</h3>
            <p>
              We retain your Google user data (name, email, account record) for as long as your
              account is active. If you delete your account via the Settings page, all personal data
              associated with your account — including your name, email, analysis history, and token
              balance — will be permanently deleted within 30 days.
            </p>
            <p>
              To request deletion of your data at any time, you may also contact us directly at{' '}
              <a href="mailto:marko@trytailor.cv" className="text-primary underline-offset-4 hover:underline">
                marko@trytailor.cv
              </a>
              .
            </p>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">4. How We Use Your Information</h2>
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
          <h2 className="text-base font-semibold text-foreground">5. Cookies</h2>
          <p>
            We use session cookies necessary for authentication and to keep you signed in. We do not
            use advertising or tracking cookies. Analytics data collected by Vercel is anonymized
            and does not identify individual users.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">6. Your Rights</h2>
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
          <h2 className="text-base font-semibold text-foreground">7. Children&apos;s Privacy</h2>
          <p>
            The Service is not directed to children under the age of 13. We do not knowingly collect
            personal information from children. If you believe a child has provided us with their
            information, please contact us and we will delete it promptly.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">8. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of significant
            changes via the email associated with your account. Continued use of the Service after
            updates constitutes acceptance of the revised Policy.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">9. Contact</h2>
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
