import {
  AddressBook,
  Briefcase,
  CalendarBlank,
  Code,
  MusicNotes,
  Stack,
  TerminalWindow
} from "@phosphor-icons/react/dist/ssr";
import TerminalWidget from "@/components/terminal-widget";
import SectionHeader from "@/components/section-header";
import SiteNav from "@/components/site-nav";
import ListeningTeaser from "@/components/listening-teaser";

const stats = [
  ["gpa", "4.00 / 4.00"],
  ["hours_saved_weekly", "15+ hrs"],
  ["budget_managed", "$50K"],
  ["degree_focus", "CS + Data Science"]
] as const;

const experience = [
  {
    period: "Apr 2025 - Present",
    org: "EECPLL",
    orgSub: "W. P. Carey School of Business • Arizona State University • Tempe, AZ",
    role: "AI Automation Developer",
    impact:
      "Building AI-powered systems that turn hours of manual work into minutes without losing human judgment.",
    bullets: [
      "Designing and deploying practical AI workflows that solve operational bottlenecks in professional services.",
      "Built an AI-enabled outreach system that researches prospects, drafts personalized communication, then routes every message through human review.",
      "Configured multi-step automation logic, prompt workflows, and iterative system design based on production feedback."
    ]
  },
  {
    period: "Mar 2025 - Apr 2025",
    org: "AZNext",
    orgSub: "W. P. Carey School of Business • Arizona State University",
    role: "Technical Lead - Data & Software Engineering",
    impact: "15+ hours saved per week",
    bullets: [
      "Built a Python-based agentic AI workflow and state machine that fully automated manual data entry.",
      "Engineered data pipelines and standardized usage tracking across fragmented legacy systems with Python + SQL.",
      "Led sprint planning, peer reviews, and AI safety guardrails in an agile build cycle."
    ]
  },
  {
    period: "May 2024 - Present",
    org: "DevLabs at ASU",
    orgSub: "500-member organization • Arizona State University",
    role: "VP of Finance (Treasurer)",
    impact: "$50,000 budget managed",
    bullets: [
      "Manage a $50k operational budget while funding high-scale technical events.",
      "Built forecasting models and reduced repetitive monthly reporting through automation.",
      "Connect developer execution with financial strategy for sustainable club operations."
    ]
  }
] as const;

const projects = [
  {
    tag: "Full-stack • AI-native",
    name: "Sage",
    desc:
      "Interactive analytics platform that ingests unstructured enterprise data and turns it into structured insight with GenAI models and repeatable prompt templates.",
    stack: ["React", "Node.js", "TypeScript", "Python", "LLM APIs"]
  },
  {
    tag: "Backend • Cloud-native",
    name: "AeroDocs",
    desc:
      "Enterprise-grade backend service built with strict validation, secure document handling, and automated testing for sensitive organizational workflows.",
    stack: ["Java", "SQL", "Docker", "CI/CD", "OOP"]
  },
  {
    tag: "Agentic AI • Automation",
    name: "AZNext Workflow Engine",
    desc:
      "Autonomous state machine that tracks operational data in real-time and structures ambiguous business information, eliminating 15+ hours of manual work weekly.",
    stack: ["Python", "Agentic AI", "State Machines", "Data Analysis", "OpenAI API"]
  }
] as const;

const stackGroups = [
  ["Languages", ["Python", "Java", "TypeScript", "SQL", "C++", "JavaScript", "Go"]],
  ["AI & Automation", ["Agentic AI", "OpenAI API", "Claude API", "Prompt Eng.", "Cursor", "LLM Workflows"]],
  ["Web & Frameworks", ["React", "Node.js", "Django", "React Native", "REST APIs"]],
  ["Cloud & DevOps", ["AWS EC2/RDS", "Docker", "BigQuery", "CI/CD", "Kubernetes", "Git"]],
  ["Data", ["ETL Pipelines", "Financial Modeling", "Google Pub/Sub", "BigQuery"]],
  ["Enterprise", ["Salesforce CRM", "Microsoft 365", "Excel", "Agile / Scrum"]]
] as const;

export default function HomePage() {
  return (
    <main>
      <div className="grain" aria-hidden="true" />
      <SiteNav />

      <section id="hero" className="hero container">
        <div>
          <p className="eyebrow">Available for opportunities</p>
          <h1>
            Chakshu Jain
            <span>Software Engineer + Data Scientist</span>
          </h1>
          <p className="lead">
            I do not just write code. I build automation systems that eliminate operational drag and
            still keep humans in control where judgment matters.
          </p>
          <div className="cta-row">
            <a href="#projects" className="btn btn-primary">
              View Work
            </a>
            <a href="https://cal.com/chakshujain" target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
              Book a Call
            </a>
          </div>
        </div>
        <div className="stats-grid" aria-label="Quick metrics">
          {stats.map(([key, val]) => (
            <article key={key} className="stat-card">
              <p>{key}</p>
              <h3>{val}</h3>
            </article>
          ))}
        </div>
      </section>

      <section id="experience" className="container section-pad">
        <SectionHeader number="01" title="Experience" IconComponent={Briefcase} />
        <div className="exp-list">
          {experience.map((item) => (
            <article className="exp-item" key={`${item.org}-${item.period}`}>
              <div>
                <p className="exp-period">{item.period}</p>
                <h3 className="exp-org">{item.org}</h3>
                <p className="exp-org-sub">{item.orgSub}</p>
              </div>
              <div>
                <h4 className="exp-role">{item.role}</h4>
                <p className="exp-impact">{item.impact}</p>
                <ul className="exp-bullets">
                  {item.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="projects" className="container section-pad">
        <SectionHeader number="02" title="Projects" IconComponent={Code} />
        <div className="projects-grid">
          {projects.map((project) => (
            <article key={project.name} className="project-card">
              <p className="project-tag">{project.tag}</p>
              <h3 className="project-name">{project.name}</h3>
              <p className="project-desc">{project.desc}</p>
              <div className="project-stack">
                {project.stack.map((tag) => (
                  <span key={tag} className="tag">
                    {tag}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="stack" className="container section-pad">
        <SectionHeader number="03" title="Stack" IconComponent={Stack} />
        <div className="skills-grid">
          {stackGroups.map(([group, skills]) => (
            <article key={group} className="skill-group">
              <p className="skill-group-label">{group}</p>
              <div className="skill-list">
                {skills.map((skill) => (
                  <span key={skill} className="tag">
                    {skill}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="orbital" className="container section-pad orbital-placeholder">
        <div className="section-header">
          <span className="section-num">04</span>
          <h2 className="section-title">Orbital</h2>
          <div className="section-line" />
        </div>
        <p className="lead compact">Orbital canvas migration is queued next. Legacy game remains available in the static snapshot.</p>
      </section>

      <section id="terminal" className="container section-pad">
        <SectionHeader number="05" title="Terminal" IconComponent={TerminalWindow} />
        <TerminalWidget />
      </section>

      <section id="listening" className="container section-pad">
        <SectionHeader number="06" title="Listening" IconComponent={MusicNotes} />
        <a href="/music" className="music-teaser">
          <div>
            <p className="music-teaser-label">Current rotation.</p>
            <p className="music-teaser-sub">weekly rotation pulled live from last.fm/user/chakshujain</p>
            <ListeningTeaser />
          </div>
          <span className="music-teaser-arrow">Open /music</span>
        </a>
      </section>

      <section id="booking" className="container section-pad">
        <SectionHeader number="07" title="Book a call" IconComponent={CalendarBlank} />
        <div className="cal-card">
          <div>
            <p className="cal-tag">30 min</p>
            <h3 className="cal-title">Let&apos;s talk. Pick a time.</h3>
            <p className="cal-subtitle">Project, collaboration, or technical discussion. Calendar is open.</p>
          </div>
          <a className="btn btn-primary" href="https://cal.com/chakshujain" target="_blank" rel="noopener noreferrer">
            Open calendar
          </a>
        </div>
      </section>

      <section id="contact" className="container section-pad contact-block">
        <SectionHeader number="08" title="Contact" IconComponent={AddressBook} />
        <div className="contact-grid">
          <div>
            <h3 className="contact-tagline">Let&apos;s build something real.</h3>
            <p className="contact-note">Currently in Tempe, AZ. Open to internships, collaborations, and interesting problems.</p>
          </div>
          <div className="contact-links">
            <a href="mailto:chakshuvinayjain@gmail.com">chakshuvinayjain@gmail.com</a>
            <a href="https://linkedin.com/in/chakshu-jain-281307243" target="_blank" rel="noopener noreferrer">
              linkedin.com/in/chakshu-jain-281307243
            </a>
            <a href="https://github.com/FornaxChemica" target="_blank" rel="noopener noreferrer">
              github.com/FornaxChemica
            </a>
            <a href="tel:6025021090">(602) 502-1090</a>
          </div>
        </div>
      </section>

      <footer className="container footer-line">
        <p>© 2026 Chakshu Jain - chakshu.dev</p>
        <a href="/index.html" className="btn btn-ghost">
          Open Legacy Snapshot
        </a>
      </footer>
    </main>
  );
}
