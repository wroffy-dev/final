/** Default transactional templates seeded into EmailTemplate. */
export const DEFAULT_EMAIL_TEMPLATES = [
  {
    key: 'new_lead',
    name: 'New lead notification',
    subject: 'New lead: {{lead_name}}{{product_suffix}}',
    body: `<p>A new lead has been captured on {{site_name}}.</p>
<table cellpadding="6" style="border-collapse:collapse">
  <tr><td><strong>Name</strong></td><td>{{lead_name}}</td></tr>
  <tr><td><strong>Email</strong></td><td>{{lead_email}}</td></tr>
  <tr><td><strong>Phone</strong></td><td>{{lead_phone}}</td></tr>
  <tr><td><strong>Company</strong></td><td>{{lead_company}}</td></tr>
  <tr><td><strong>Product</strong></td><td>{{product_name}}</td></tr>
  <tr><td><strong>Source</strong></td><td>{{lead_source}}</td></tr>
  <tr><td><strong>Campaign</strong></td><td>{{utm_campaign}}</td></tr>
  <tr><td><strong>Landing page</strong></td><td>{{landing_url}}</td></tr>
</table>
<p><strong>Message</strong><br/>{{lead_message}}</p>
<p><a href="{{lead_url}}">Open lead in CRM</a></p>`,
  },
  {
    key: 'lead_assigned',
    name: 'Lead assigned to staff member',
    subject: 'Lead assigned to you: {{lead_name}}',
    body: `<p>Hello {{assignee_name}},</p>
<p>{{actor_name}} assigned a lead to you on {{site_name}}.</p>
<table cellpadding="6" style="border-collapse:collapse">
  <tr><td><strong>Name</strong></td><td>{{lead_name}}</td></tr>
  <tr><td><strong>Email</strong></td><td>{{lead_email}}</td></tr>
  <tr><td><strong>Phone</strong></td><td>{{lead_phone}}</td></tr>
  <tr><td><strong>Status</strong></td><td>{{lead_status}}</td></tr>
</table>
<p><a href="{{lead_url}}">Open lead in CRM</a></p>`,
  },
  {
    key: 'form_submission',
    name: 'Form submission notification',
    subject: 'New submission: {{form_name}}',
    body: `<p>A form was submitted on {{site_name}}.</p>
<p><strong>Form</strong>: {{form_name}}<br/>
<strong>Page</strong>: {{landing_url}}</p>
{{submission_table}}`,
  },
  {
    key: 'lead_confirmation',
    name: 'Confirmation to the lead',
    subject: 'Thanks for reaching out to {{site_name}}',
    body: `<p>Hello {{lead_name}},</p>
<p>Thanks for getting in touch with {{site_name}}. A specialist will contact you shortly{{product_suffix}}.</p>
<p>— {{site_name}}</p>`,
  },
] as const;

export type EmailTemplateKey = (typeof DEFAULT_EMAIL_TEMPLATES)[number]['key'];

/** Replaces {{token}} placeholders. Unknown tokens resolve to an empty string. */
export function renderTemplate(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => tokens[key] ?? '');
}
