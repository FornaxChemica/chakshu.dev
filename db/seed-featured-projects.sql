INSERT OR REPLACE INTO featured_projects (
  repo_name,
  sort_order,
  featured,
  display_name,
  tag,
  description,
  stack_json,
  homepage_url,
  logo_url,
  updated_at
) VALUES
(
  'chakshu.dev',
  0,
  1,
  'chakshu.dev',
  'Portfolio · Live',
  'Personal portfolio — experience, trails, music, and projects.',
  '["Next.js","TypeScript","Cloudflare"]',
  NULL,
  NULL,
  CURRENT_TIMESTAMP
),
(
  'Sage',
  1,
  1,
  'Sage',
  'Full-stack · AI-native',
  'Interactive analytics platform that ingests unstructured enterprise data and uses advanced GenAI models to summarize and output structured analytics. Features repeatable prompt templates and a responsive dashboard bridging UI with backend REST APIs.',
  '["React","Node.js","TypeScript","Python","LLM APIs"]',
  NULL,
  NULL,
  CURRENT_TIMESTAMP
),
(
  'aero_docs',
  2,
  1,
  'AeroDocs',
  'Backend · Cloud-native',
  'Enterprise-grade, cloud-native backend service built from scratch using OOP to process, validate, and securely store sensitive organizational records. Features automated testing, strict data-handling protocols, and API optimization.',
  '["Java","SQL","Docker","CI/CD","OOP"]',
  NULL,
  NULL,
  CURRENT_TIMESTAMP
),
(
  'AZNext-Workflow-Engine',
  3,
  1,
  'AZNext Workflow Engine',
  'Agentic AI · Automation',
  'Autonomous state machine that tracks operational data in real-time, identifies anti-patterns, and dynamically extracts and structures ambiguous business information - eliminating 15+ hours of manual work weekly across the organization.',
  '["Python","Agentic AI","State Machines","Data Analysis","OpenAI API"]',
  NULL,
  NULL,
  CURRENT_TIMESTAMP
);
