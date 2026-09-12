import { SitePageKey } from "@prisma/client";

export const SITE_PAGE_META: Record<
  SitePageKey,
  { title: string; publicPath: string; description: string }
> = {
  PRIVACY: {
    title: "Privacy Policy",
    publicPath: "/privacy",
    description: "How Sunbuild collects and protects information",
  },
  TERMS: {
    title: "Terms of Service",
    publicPath: "/terms",
    description: "Terms governing use of Sunbuild CRM",
  },
};

export const DEFAULT_SITE_PAGES: Record<SitePageKey, string> = {
  PRIVACY: `
<section><h2>Who we are</h2><p>Sunbuild CRM (“Sunbuild”, “we”, “us”) is a construction project management platform operated for Sunview Homes and related building companies. This policy explains how we handle information when you use our website and services at your deployed Sunbuild URL.</p></section>
<section><h2>Information we collect</h2><p>We may collect:</p><ul><li><strong>Account data</strong> — name, email, phone, role, company membership, profile image, and authentication details (including hashed passwords and optional multi-factor authentication).</li><li><strong>Project &amp; business data</strong> — jobs, schedules, tasks, documents, photos, RFIs, change orders, selections, invoices, payments, leads, proposals, and related construction records you or your organization enter into Sunbuild.</li><li><strong>Usage &amp; technical data</strong> — login sessions, device / browser information, IP address, and security audit events needed to operate and protect the service.</li><li><strong>Optional Google account data</strong> — if you connect Google Calendar, we receive limited OAuth tokens and calendar/event data required to sync eligible Sunbuild activities.</li></ul></section>
<section><h2>Google Calendar integration</h2><p>Sunbuild offers an optional Google Calendar connection so staff can sync certain meetings and site activities to their Google Calendar. We request only the scopes needed for this feature. We do <strong>not</strong> use Google data for advertising or sell it to third parties. You can disconnect Google Calendar anytime from Sunbuild Settings.</p></section>
<section><h2>How we use information</h2><ul><li>Provide, maintain, and improve Sunbuild CRM</li><li>Authenticate users and enforce role-based access</li><li>Sync calendar events when you enable Google Calendar</li><li>Send transactional messages (invites, password resets, alerts)</li><li>Detect abuse, secure accounts, and meet legal obligations</li></ul></section>
<section><h2>Sharing</h2><p>We do not sell personal information. We share data only with service providers under contractual safeguards, Google for authorized calendar sync, your organization administrators, and authorities when required by law.</p></section>
<section><h2>Retention &amp; security</h2><p>We retain account and project data while your organization uses Sunbuild and as needed for backups, disputes, or legal requirements. We use industry-standard safeguards such as encrypted transport (HTTPS), access controls, and hashed credentials.</p></section>
<section><h2>Your choices</h2><ul><li>Update profile details inside Sunbuild</li><li>Disconnect Google Calendar from Settings</li><li>Request account deactivation through your company admin</li><li>Contact us for access, correction, or deletion requests where applicable by law</li></ul></section>
<section><h2>Children</h2><p>Sunbuild is a business tool and is not directed to children under 13. We do not knowingly collect personal information from children.</p></section>
<section><h2>Changes</h2><p>We may update this policy from time to time. The “Last updated” date at the top will change when we do. Continued use of Sunbuild after updates means you accept the revised policy.</p></section>
<section><h2>Contact</h2><p>Questions about privacy: contact your Sunbuild / Sunview Homes administrator, or reach us through the support channels published on our home page.</p></section>
`.trim(),
  TERMS: `
<section><h2>Agreement</h2><p>These Terms of Service (“Terms”) govern access to and use of Sunbuild CRM (“Sunbuild”, “the Service”), a construction management platform used by Sunview Homes and authorized users. By creating an account or using the Service, you agree to these Terms.</p></section>
<section><h2>The Service</h2><p>Sunbuild provides tools for project management, scheduling, documents, selections, financial tracking, client collaboration, and related workflows. Features may change as we improve the product. Some features (including Google Calendar sync) are optional and may require additional third-party accounts.</p></section>
<section><h2>Accounts &amp; access</h2><ul><li>You must provide accurate account information and keep credentials confidential.</li><li>Access is role-based. You may only use data and projects your organization has authorized for your role.</li><li>Company administrators may invite, suspend, or remove users.</li><li>You are responsible for activity under your account.</li></ul></section>
<section><h2>Acceptable use</h2><p>You agree not to:</p><ul><li>Misuse the Service or attempt unauthorized access</li><li>Upload unlawful, harmful, or infringing content</li><li>Interfere with security, availability, or other users</li><li>Use automated scraping or reverse engineering except as allowed by law</li><li>Use Google or other connected services beyond the permissions you grant and the features Sunbuild provides</li></ul></section>
<section><h2>Customer data</h2><p>Your organization owns the project and business content entered into Sunbuild. You grant us a limited license to host, process, and display that content solely to operate the Service. You represent that you have the rights needed to submit that content.</p></section>
<section><h2>Google Calendar</h2><p>If you connect Google Calendar, you authorize Sunbuild to create and manage calendar events related to eligible Sunbuild activities. Google’s terms and privacy policy also apply to your Google account. You may disconnect at any time. We use Google user data only to provide calendar sync functionality described in our Privacy Policy.</p></section>
<section><h2>Third-party services</h2><p>The Service may integrate with hosting, email, Google, Microsoft, or other providers. Those services are governed by their own terms. We are not responsible for third-party outages or policy changes outside our control.</p></section>
<section><h2>Availability &amp; disclaimers</h2><p>We aim for reliable uptime but do not guarantee uninterrupted or error-free operation. THE SERVICE IS PROVIDED “AS IS” WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, TO THE MAXIMUM EXTENT PERMITTED BY LAW.</p></section>
<section><h2>Limitation of liability</h2><p>To the fullest extent permitted by law, Sunbuild and its operators are not liable for indirect, incidental, special, consequential, or lost profits damages arising from use of the Service. Our aggregate liability for any claim relating to the Service is limited to the fees paid for the Service in the twelve (12) months before the claim, or CAD $100 if no fees apply.</p></section>
<section><h2>Suspension &amp; termination</h2><p>We may suspend or terminate access for security risks, Terms violations, or at an administrator’s request. You may stop using the Service at any time. Provisions that by nature should survive will survive termination.</p></section>
<section><h2>Changes</h2><p>We may update these Terms. Material changes will be reflected by the “Last updated” date on this page. Continued use after changes constitutes acceptance.</p></section>
<section><h2>Contact</h2><p>Questions about these Terms: contact your organization administrator or use the contact options on our home page.</p></section>
`.trim(),
};

/** Strip scripts / event handlers while keeping basic legal markup. */
export function sanitizeSiteHtml(html: string): string {
  let out = html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<\/?(?:iframe|object|embed|form|input|button|textarea|select)[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*(["'])[\s\S]*?\1/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript:/gi, "");
  if (out.length > 200_000) {
    out = out.slice(0, 200_000);
  }
  return out.trim();
}
