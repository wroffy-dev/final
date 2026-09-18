/**
 * Demo CMS section payloads used by the seed script.
 * Shapes match the Zod schemas in src/lib/cms/blocks.
 */
export const demoHome = [
  {
    blockType: 'hero',
    name: 'Homepage hero',
    content: {
      eyebrow: 'Authorised Dropbox Reseller',
      heading: 'Dropbox for business, bought and supported locally',
      description:
        'Licences, migration, onboarding and day-two support for Dropbox Business and Enterprise — billed in your currency with a named account manager.',
      primaryCtaLabel: 'Talk to Sales',
      primaryCtaUrl: '/contact',
      secondaryCtaLabel: 'Compare plans',
      secondaryCtaUrl: '/pricing',
      alignment: 'left',
      bullets: ['Local invoicing & GST', 'Free guided migration', 'Named account manager'],
    },
    settings: { background: 'gradient', paddingTop: 'xl', paddingBottom: 'xl' },
  },
  {
    blockType: 'logoWall',
    name: 'Trust bar',
    content: {
      heading: 'Trusted by teams that move a lot of files',
      logos: [
        { label: 'Northwind' },
        { label: 'Acme Studios' },
        { label: 'Vertex Legal' },
        { label: 'Blue Harbour' },
        { label: 'Meridian Labs' },
      ],
    },
    settings: { background: 'muted', paddingTop: 'md', paddingBottom: 'md' },
  },
  {
    blockType: 'productCards',
    name: 'Plans',
    content: {
      heading: 'Choose a Dropbox plan',
      description: 'Every plan includes onboarding, migration support and local billing.',
      source: 'featured',
      limit: 3,
      columns: 3,
      showPrice: true,
    },
    settings: { background: 'default', paddingTop: 'lg', paddingBottom: 'lg' },
  },
  {
    blockType: 'featureGrid',
    name: 'Why buy through us',
    content: {
      heading: 'Why buy through an authorised reseller',
      description: 'You get the same Dropbox product, with far more help around it.',
      columns: 3,
      items: [
        {
          title: 'Local billing',
          description: 'Invoices in your currency with GST/VAT handled, plus annual purchase orders.',
          icon: 'receipt',
        },
        {
          title: 'Guided migration',
          description: 'We move your data from Google Drive, SharePoint, Box or a NAS without downtime.',
          icon: 'move',
        },
        {
          title: 'Named support',
          description: 'A real account manager who knows your tenancy — not a generic queue.',
          icon: 'headset',
        },
        {
          title: 'Security review',
          description: 'Sharing policies, device approvals and admin roles configured to your policy.',
          icon: 'shield',
        },
        {
          title: 'Training',
          description: 'Live onboarding for admins and end users, plus recorded sessions.',
          icon: 'graduation',
        },
        {
          title: 'Renewal management',
          description: 'Proactive licence right-sizing before every renewal so you never overpay.',
          icon: 'refresh',
        },
      ],
    },
    settings: { background: 'muted', paddingTop: 'lg', paddingBottom: 'lg' },
  },
  {
    blockType: 'productTable',
    name: 'Plan comparison',
    content: {
      heading: 'Compare Dropbox plans',
      description: 'Storage, users and pricing side by side.',
      source: 'all',
      limit: 6,
      showStorage: true,
      showUsers: true,
      showMonthly: true,
      showAnnual: true,
      showFeatures: true,
      ctaLabel: 'Get a quote',
    },
    settings: { background: 'default', paddingTop: 'lg', paddingBottom: 'lg' },
  },
  {
    blockType: 'testimonials',
    name: 'Customer proof',
    content: {
      heading: 'What customers say',
      items: [
        {
          quote:
            'The migration from our old file server took a weekend and nobody lost a file. Support has been genuinely responsive since.',
          name: 'Priya Menon',
          role: 'Head of IT',
          company: 'Meridian Labs',
        },
        {
          quote:
            'Local invoicing alone saved us weeks of procurement. Getting a named contact was the part we did not expect.',
          name: 'Daniel Okafor',
          role: 'Operations Director',
          company: 'Blue Harbour',
        },
        {
          quote:
            'We right-sized 40 unused licences at renewal. That paid for the onboarding several times over.',
          name: 'Sarah Whitfield',
          role: 'Finance Manager',
          company: 'Vertex Legal',
        },
      ],
    },
    settings: { background: 'muted', paddingTop: 'lg', paddingBottom: 'lg' },
  },
  {
    blockType: 'faq',
    name: 'FAQ',
    content: {
      heading: 'Frequently asked questions',
      items: [
        {
          question: 'Is the product different from buying direct from Dropbox?',
          answer:
            'No. You get exactly the same Dropbox product and the same admin console. What changes is the billing, onboarding and the support wrapped around it.',
        },
        {
          question: 'Can you migrate our existing data?',
          answer:
            'Yes. We migrate from Google Drive, OneDrive, SharePoint, Box, Egnyte and on-premise file servers. Migrations run in the background and are verified file-by-file.',
        },
        {
          question: 'How is billing handled?',
          answer:
            'We invoice locally in your currency with the correct tax treatment. Annual and multi-year terms are available, and we accept purchase orders.',
        },
        {
          question: 'What happens at renewal?',
          answer:
            'We review your licence utilisation before renewal and recommend right-sizing so you only pay for the seats you actually use.',
        },
      ],
    },
    settings: { background: 'default', paddingTop: 'lg', paddingBottom: 'lg' },
  },
  {
    blockType: 'cta',
    name: 'Closing CTA',
    content: {
      heading: 'Ready to move your team to Dropbox?',
      description: 'Tell us your team size and where your files live today. We will send a plan and a quote.',
      primaryCtaLabel: 'Talk to Sales',
      primaryCtaUrl: '/contact',
      secondaryCtaLabel: 'See pricing',
      secondaryCtaUrl: '/pricing',
      variant: 'panel',
    },
    settings: { background: 'brand', paddingTop: 'lg', paddingBottom: 'lg' },
  },
];

export const demoPricing = [
  {
    blockType: 'hero',
    name: 'Pricing hero',
    content: {
      eyebrow: 'Pricing',
      heading: 'Transparent Dropbox pricing',
      description: 'All plans are billed locally and include onboarding and migration support.',
      alignment: 'center',
      primaryCtaLabel: 'Request a quote',
      primaryCtaUrl: '/contact',
    },
    settings: { background: 'muted', paddingTop: 'lg', paddingBottom: 'lg' },
  },
  {
    blockType: 'productTable',
    name: 'Full comparison',
    content: {
      heading: 'Compare every plan',
      source: 'all',
      limit: 10,
      showStorage: true,
      showUsers: true,
      showMonthly: true,
      showAnnual: true,
      showFeatures: true,
      ctaLabel: 'Get a quote',
    },
    settings: { background: 'default', paddingTop: 'lg', paddingBottom: 'lg' },
  },
  {
    blockType: 'faq',
    name: 'Pricing FAQ',
    content: {
      heading: 'Pricing questions',
      items: [
        {
          question: 'Are prices per user?',
          answer: 'Yes, plans are priced per user per month and billed annually unless you request monthly terms.',
        },
        {
          question: 'Do you offer volume discounts?',
          answer: 'Yes. Discounts start at 25 seats and increase at 100 and 250 seats. Ask for a quote.',
        },
      ],
    },
    settings: { background: 'muted', paddingTop: 'lg', paddingBottom: 'lg' },
  },
];

export const demoContact = [
  {
    blockType: 'hero',
    name: 'Contact hero',
    content: {
      eyebrow: 'Contact',
      heading: 'Talk to a Dropbox specialist',
      description: 'Tell us about your team and we will come back within one business day.',
      alignment: 'center',
    },
    settings: { background: 'muted', paddingTop: 'lg', paddingBottom: 'md' },
  },
  {
    blockType: 'formBlock',
    name: 'Contact form',
    content: {
      heading: 'Send us a message',
      description: 'We reply to every enquiry within one business day.',
      formSlug: 'contact-sales',
      layout: 'split',
      sideHeading: 'What happens next',
      sideBullets: [
        'A specialist reviews your requirement',
        'We send a plan recommendation and quote',
        'Optional migration and onboarding plan',
      ],
    },
    settings: { background: 'default', paddingTop: 'lg', paddingBottom: 'lg' },
  },
];

export const demoAbout = [
  {
    blockType: 'hero',
    name: 'About hero',
    content: {
      eyebrow: 'About us',
      heading: 'A Dropbox partner, not a licence vending machine',
      description:
        'We have helped hundreds of teams move to Dropbox and stay productive on it — from five-person studios to regulated enterprises.',
      alignment: 'center',
    },
    settings: { background: 'gradient', paddingTop: 'lg', paddingBottom: 'lg' },
  },
  {
    blockType: 'imageContent',
    name: 'Our approach',
    content: {
      heading: 'We start with how your team actually works',
      description:
        '<p>Most file migrations fail because folder structures and sharing habits are copied over without review. We map how your teams collaborate first, then design a Dropbox structure that matches it.</p><p>The result is fewer support tickets, cleaner permissions and licences that match real usage.</p>',
      imagePosition: 'right',
      ctaLabel: 'Talk to us',
      ctaUrl: '/contact',
    },
    settings: { background: 'default', paddingTop: 'lg', paddingBottom: 'lg' },
  },
  {
    blockType: 'richText',
    name: 'Company statement',
    content: {
      heading: 'What we stand for',
      content:
        '<p>We only recommend what a team will actually use. If a lower plan fits, we will tell you — a renewal you are happy with is worth more than a licence you regret.</p>',
      width: 'narrow',
    },
    settings: { background: 'muted', paddingTop: 'lg', paddingBottom: 'lg' },
  },
];
