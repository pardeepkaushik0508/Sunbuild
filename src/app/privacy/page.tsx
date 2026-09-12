import type { Metadata } from "next";
import Link from "next/link";
import {
  LegalDoc,
  LegalSection,
} from "@/components/marketing/public-shell";

export const metadata: Metadata = {
  title: "Privacy Policy · Sunbuild CRM",
  description:
    "How Sunbuild CRM collects, uses, and protects your information, including optional Google Calendar access.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalDoc title="Privacy Policy" updated="September 12, 2026">
      <LegalSection title="Who we are">
        <p>
          Sunbuild CRM (“Sunbuild”, “we”, “us”) is a construction project
          management platform operated for Sunview Homes and related building
          companies. This policy explains how we handle information when you use
          our website and services at your deployed Sunbuild URL.
        </p>
      </LegalSection>

      <LegalSection title="Information we collect">
        <p>We may collect:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Account data</strong> — name, email, phone, role, company
            membership, profile image, and authentication details (including
            hashed passwords and optional multi-factor authentication).
          </li>
          <li>
            <strong>Project & business data</strong> — jobs, schedules, tasks,
            documents, photos, RFIs, change orders, selections, invoices,
            payments, leads, proposals, and related construction records you or
            your organization enter into Sunbuild.
          </li>
          <li>
            <strong>Usage & technical data</strong> — login sessions, device /
            browser information, IP address, and security audit events needed to
            operate and protect the service.
          </li>
          <li>
            <strong>Optional Google account data</strong> — if you connect Google
            Calendar, we receive limited OAuth tokens and calendar/event data
            required to sync eligible Sunbuild activities (see below).
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Google Calendar integration">
        <p>
          Sunbuild offers an optional Google Calendar connection so staff can
          sync certain meetings and site activities to their Google Calendar.
          When you choose to connect, Google may share:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Your Google account email address</li>
          <li>Permission to create and manage calendar events you authorize</li>
          <li>OAuth access and refresh tokens stored securely for sync</li>
        </ul>
        <p>
          We request only the scopes needed for this feature (calendar events,
          basic profile email, and OpenID). We do <strong>not</strong> use Google
          data for advertising, sell it to third parties, or access unrelated
          Google services.
        </p>
        <p>
          You can disconnect Google Calendar anytime from Sunbuild Settings. You
          may also revoke access in your{" "}
          <a
            className="font-medium text-sb-orange underline hover:text-sb-orange-dark"
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Account permissions
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="How we use information">
        <ul className="list-disc space-y-1 pl-5">
          <li>Provide, maintain, and improve Sunbuild CRM</li>
          <li>Authenticate users and enforce role-based access</li>
          <li>Sync calendar events when you enable Google Calendar</li>
          <li>Send transactional messages (invites, password resets, alerts)</li>
          <li>Detect abuse, secure accounts, and meet legal obligations</li>
        </ul>
      </LegalSection>

      <LegalSection title="Sharing">
        <p>
          We do not sell personal information. We share data only with:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Service providers that host or operate the app (for example cloud
            hosting and email delivery), under contractual safeguards
          </li>
          <li>Google, solely to perform calendar sync you authorize</li>
          <li>Your organization administrators within Sunbuild</li>
          <li>Authorities when required by law</li>
        </ul>
      </LegalSection>

      <LegalSection title="Retention & security">
        <p>
          We retain account and project data while your organization uses
          Sunbuild and as needed for backups, disputes, or legal requirements.
          We use industry-standard safeguards such as encrypted transport (HTTPS),
          access controls, and hashed credentials. No method of transmission or
          storage is 100% secure.
        </p>
      </LegalSection>

      <LegalSection title="Your choices">
        <ul className="list-disc space-y-1 pl-5">
          <li>Update profile details inside Sunbuild</li>
          <li>Disconnect Google Calendar from Settings</li>
          <li>Request account deactivation through your company admin</li>
          <li>
            Contact us for access, correction, or deletion requests where
            applicable by law
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Children">
        <p>
          Sunbuild is a business tool and is not directed to children under 13.
          We do not knowingly collect personal information from children.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          We may update this policy from time to time. The “Last updated” date
          at the top will change when we do. Continued use of Sunbuild after
          updates means you accept the revised policy.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions about privacy: contact your Sunbuild / Sunview Homes
          administrator, or reach us through the support channels published on
          our{" "}
          <Link href="/" className="font-medium text-sb-orange underline">
            home page
          </Link>
          .
        </p>
      </LegalSection>
    </LegalDoc>
  );
}
