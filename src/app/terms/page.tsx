import type { Metadata } from "next";
import Link from "next/link";
import {
  LegalDoc,
  LegalSection,
} from "@/components/marketing/public-shell";

export const metadata: Metadata = {
  title: "Terms of Service · Sunbuild CRM",
  description:
    "Terms governing use of Sunbuild CRM, including optional Google Calendar integration.",
};

export default function TermsOfServicePage() {
  return (
    <LegalDoc title="Terms of Service" updated="September 12, 2026">
      <LegalSection title="Agreement">
        <p>
          These Terms of Service (“Terms”) govern access to and use of Sunbuild
          CRM (“Sunbuild”, “the Service”), a construction management platform
          used by Sunview Homes and authorized users. By creating an account or
          using the Service, you agree to these Terms.
        </p>
      </LegalSection>

      <LegalSection title="The Service">
        <p>
          Sunbuild provides tools for project management, scheduling, documents,
          selections, financial tracking, client collaboration, and related
          workflows. Features may change as we improve the product. Some
          features (including Google Calendar sync) are optional and may require
          additional third-party accounts.
        </p>
      </LegalSection>

      <LegalSection title="Accounts & access">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            You must provide accurate account information and keep credentials
            confidential.
          </li>
          <li>
            Access is role-based. You may only use data and projects your
            organization has authorized for your role.
          </li>
          <li>
            Company administrators may invite, suspend, or remove users.
          </li>
          <li>
            You are responsible for activity under your account.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Misuse the Service or attempt unauthorized access</li>
          <li>Upload unlawful, harmful, or infringing content</li>
          <li>Interfere with security, availability, or other users</li>
          <li>
            Use automated scraping or reverse engineering except as allowed by
            law
          </li>
          <li>
            Use Google or other connected services beyond the permissions you
            grant and the features Sunbuild provides
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Customer data">
        <p>
          Your organization owns the project and business content entered into
          Sunbuild. You grant us a limited license to host, process, and display
          that content solely to operate the Service. You represent that you
          have the rights needed to submit that content.
        </p>
      </LegalSection>

      <LegalSection title="Google Calendar">
        <p>
          If you connect Google Calendar, you authorize Sunbuild to create and
          manage calendar events related to eligible Sunbuild activities, using
          Google’s OAuth permissions. Google’s terms and privacy policy also
          apply to your Google account. You may disconnect at any time. We use
          Google user data only to provide calendar sync functionality described
          in our{" "}
          <Link href="/privacy" className="font-medium text-sb-orange underline">
            Privacy Policy
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="Third-party services">
        <p>
          The Service may integrate with hosting, email, Google, Microsoft, or
          other providers. Those services are governed by their own terms. We are
          not responsible for third-party outages or policy changes outside our
          control.
        </p>
      </LegalSection>

      <LegalSection title="Availability & disclaimers">
        <p>
          We aim for reliable uptime but do not guarantee uninterrupted or
          error-free operation. THE SERVICE IS PROVIDED “AS IS” WITHOUT
          WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, TO THE MAXIMUM EXTENT
          PERMITTED BY LAW.
        </p>
      </LegalSection>

      <LegalSection title="Limitation of liability">
        <p>
          To the fullest extent permitted by law, Sunbuild and its operators are
          not liable for indirect, incidental, special, consequential, or lost
          profits damages arising from use of the Service. Our aggregate
          liability for any claim relating to the Service is limited to the
          fees paid for the Service in the twelve (12) months before the claim,
          or CAD $100 if no fees apply.
        </p>
      </LegalSection>

      <LegalSection title="Suspension & termination">
        <p>
          We may suspend or terminate access for security risks, Terms
          violations, or at an administrator’s request. You may stop using the
          Service at any time. Provisions that by nature should survive
          (including ownership, disclaimers, and liability limits) will survive
          termination.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          We may update these Terms. Material changes will be reflected by the
          “Last updated” date on this page. Continued use after changes
          constitutes acceptance.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions about these Terms: contact your organization administrator
          or use the contact options on our{" "}
          <Link href="/" className="font-medium text-sb-orange underline">
            home page
          </Link>
          .
        </p>
      </LegalSection>
    </LegalDoc>
  );
}
