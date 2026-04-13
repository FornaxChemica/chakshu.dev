import styles from "./page.module.css";
import HomeUiClient from "./ui/home-ui-client";
import MusicClient from "./ui/music-client";
import OrbitalClient from "./ui/orbital-client";
import TrailsTeaserClient from "./ui/trails-teaser-client";
import hikes from "../../data/hikes.json";
import { parseGpx } from "../../lib/parseGpx";
import type { Hike } from "../../types/hikes";

function parseMiles(distance: string): number {
  const match = distance.match(/[\d.]+/);
  return match ? Number(match[0]) : 0;
}

export default async function Home() {
  const hikeList = hikes as Hike[];
  const featuredHike = hikeList[0] ?? null;
  const featuredGpxData = featuredHike ? await parseGpx(featuredHike.gpx) : null;
  const allHikes = hikeList.map((entry) => ({ id: entry.id, name: entry.name }));
  const snapshotPositions = featuredHike ? featuredHike.snapshots.map((snapshot) => snapshot.at) : [];
  const milesHiked = hikeList.reduce((total, hike) => total + parseMiles(hike.distance), 0);

  const totalMiles = hikeList.reduce((sum, hike) => {
    const miles = parseFloat(hike.distance.replace(/[^0-9.]/g, ""));
    return sum + (Number.isNaN(miles) ? 0 : miles);
  }, 0);

  const totalElevation = hikeList.reduce((sum, hike) => {
    const ft = parseFloat(hike.elevation_gain.replace(/[^0-9.]/g, ""));
    return sum + (Number.isNaN(ft) ? 0 : ft);
  }, 0);

  const statesVisited = new Set(
    hikeList.map((hike) => hike.location.split(",").pop()?.trim()).filter(Boolean)
  ).size;

  const trailsLogged = hikeList.length;
  const mostRecent = featuredHike;

  return (
    <main className={styles.page}>
      <div className="nav-overlay" id="navOverlay" aria-hidden="true" />

      <nav>
        <div className="scroll-progress" id="scroll-progress" />
        <a className="nav-logo" href="#hero" aria-label="Go to top">
          CJ<span>.</span>
        </a>
        <button className="ham-btn" id="hamBtn" aria-label="Toggle menu" aria-expanded="false" aria-controls="navLinks">
          <span />
          <span />
          <span />
        </button>
        <ul className="nav-links" id="navLinks">
          <li><a href="#experience">Experience</a></li>
          <li><a href="#projects">Projects</a></li>
          <li><a href="#stack">Stack</a></li>
          <li><a href="#orbital">Orbital</a></li>
          <li><a href="#trails">Trails</a></li>
          <li><a href="#terminal">Terminal</a></li>
          <li><a href="https://cal.com/chakshujain" target="_blank" rel="noopener noreferrer">Book a call</a></li>
        </ul>
      </nav>

      <section id="hero">
        <div className="hero-bg" />
        <div className="hero-glow" />
        <div className="container">
          <div className="hero-grid">
            <div>
              <div className="hero-label fade-in">Available for opportunities</div>
              <div className="hero-name-wrap fade-in"><h1 className="hero-name">Chakshu<br /><span className="accent">Jain</span></h1></div>
              <p className="hero-bio fade-in">
                <strong>Software Engineer &amp; Data Scientist</strong> at ASU.<br /><br />
                I don&apos;t just write code - I build <strong>automation systems</strong> that eliminate operational drag, blending CS + Data Science + AI into solutions that actually ship.
              </p>
              <div className="hero-cta fade-in">
                <a className="btn btn-primary" href="#projects">View Work -&gt;</a>
                <a className="btn btn-ghost" href="https://cal.com/chakshujain" target="_blank" rel="noopener noreferrer">Book a Call</a>
              </div>
            </div>
            <div className="hero-stats fade-in">
              <div className="stat-row"><span className="stat-key">gpa</span><div><span className="stat-val">4.00</span><span className="stat-unit">/ 4.00</span></div></div>
              <div className="stat-row"><span className="stat-key">hours_saved_weekly</span><div><span className="stat-val">15+</span><span className="stat-unit">hrs</span></div></div>
              <div className="stat-row"><span className="stat-key">miles_hiked</span><div><span className="stat-val">{milesHiked.toFixed(1)}</span><span className="stat-unit">mi</span></div></div>
              <div className="stat-row"><span className="stat-key">budget_managed</span><div><span className="stat-val">$50K</span></div></div>
              <div className="stat-row"><span className="stat-key">degree_focus</span><div><span className="stat-val-text">CS + Data Science</span></div></div>
              <div className="stat-row"><span className="stat-key">listening_to</span><a id="stat-artist" className="stat-artist-link" href="https://open.spotify.com/search/chakshu%20jain" target="_blank" rel="noopener noreferrer">-</a></div>
              <div className="stat-row"><span className="stat-key">status</span><div className="status-dot"><span className="dot" />building</div></div>
            </div>
          </div>
        </div>
      </section>

      <section id="experience">
        <div className="container">
          <div className="section-header"><span className="section-num">01</span><span className="section-icon"><i className="ph ph-briefcase" aria-hidden="true" /></span><h2 className="section-title">Experience</h2><div className="section-line" /></div>

          <div className="exp-item">
            <div>
              <div className="exp-period">Apr 2025 - Present</div>
              <div className="exp-org">EECPLL</div>
              <div className="exp-org-sub">W. P. Carey School of Business<br />Arizona State University<br />Tempe, AZ · Part-time</div>
              <div className="exp-badge current">● Active</div>
            </div>
            <div>
              <div className="exp-role">AI Automation Developer</div>
              <div className="exp-tagline">Building AI-powered systems that turn hours of manual work into minutes - without sacrificing the human judgment that makes outreach actually land.</div>
              <ul className="exp-bullets">
                <li>Designing and deploying practical AI workflows that solve real operational problems in a professional services environment</li>
                <li>Building an AI-enabled outreach system that researches prospects, drafts personalized communications, and routes them through a human review layer before anything goes out</li>
                <li>Configuring multi-step automation logic, engineering prompts, and iterating on system design based on real-world testing and stakeholder feedback</li>
                <li>Documenting architecture, workflow decisions, and system behavior to support reliability and future scalability</li>
              </ul>
            </div>
          </div>

          <div className="exp-item">
            <div>
              <div className="exp-period">Mar 2025 - Apr 2025</div>
              <div className="exp-org">AZNext</div>
              <div className="exp-org-sub">W. P. Carey School of Business<br />Arizona State University<br />Tempe, AZ</div>
              <div className="exp-badge">Concluded</div>
            </div>
            <div>
              <div className="exp-role">Technical Lead - Data &amp; Software Eng.</div>
              <div className="exp-impact">15+ hrs saved per week</div>
              <ul className="exp-bullets">
                <li>Built a Python-based agentic AI workflow and state-machine that completely automated manual data entry, saving the organization 15+ hours per week</li>
                <li>Engineered data pipelines, consolidated usage tracking across fragmented legacy systems using Python and SQL, and standardized API metrics</li>
                <li>Led sprint planning, conducted peer code reviews, and wrote strict AI safety guardrails and technical documentation in a fast-paced Agile environment</li>
              </ul>
            </div>
          </div>

          <div className="exp-item">
            <div>
              <div className="exp-period">May 2024 - Present</div>
              <div className="exp-org">DevLabs at ASU</div>
              <div className="exp-org-sub">500-member organization<br />Arizona State University</div>
              <div className="exp-badge current">● Active</div>
            </div>
            <div>
              <div className="exp-role">VP of Finance (Treasurer)</div>
              <div className="exp-impact">$50,000 budget managed</div>
              <ul className="exp-bullets">
                <li>Manages a $50,000 operational budget for a 500-member organization, collaborating with the executive board to fund large-scale technical events</li>
                <li>Built dynamic financial models in Excel for cash flow forecasting and automated repetitive end-of-month financial reporting pipelines</li>
                <li>Combines developer logic with high-level financial strategy to sustain one of ASU&apos;s largest technical clubs</li>
              </ul>
            </div>
          </div>

          <div className="exp-item">
            <div>
              <div className="exp-period">Sep 2024 - Sep 2025</div>
              <div className="exp-org">The Browser Company</div>
              <div className="exp-org-sub">Arc Browser</div>
              <div className="exp-badge">Concluded</div>
            </div>
            <div>
              <div className="exp-role">Student Ambassador</div>
              <ul className="exp-bullets exp-bullets-tight">
                <li>Tested software features, tracked UI interaction patterns, and provided actionable, data-driven UX feedback to senior product teams</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="projects">
        <div className="container">
          <div className="section-header"><span className="section-num">02</span><span className="section-icon"><i className="ph ph-code" aria-hidden="true" /></span><h2 className="section-title">Projects</h2><div className="section-line" /></div>
          <div className="projects-grid">
            <div className="project-card">
              <div className="project-tag">Full-stack · AI-native</div>
              <div className="project-name">Sage</div>
              <p className="project-desc">Interactive analytics platform that ingests unstructured enterprise data and uses advanced GenAI models to summarize and output structured analytics. Features repeatable prompt templates and a responsive dashboard bridging UI with backend REST APIs.</p>
              <div className="project-stack"><span className="tag">React</span><span className="tag">Node.js</span><span className="tag">TypeScript</span><span className="tag">Python</span><span className="tag">LLM APIs</span></div>
            </div>
            <div className="project-card">
              <div className="project-tag">Backend · Cloud-native</div>
              <div className="project-name">AeroDocs</div>
              <p className="project-desc">Enterprise-grade, cloud-native backend service built from scratch using OOP to process, validate, and securely store sensitive organizational records. Features automated testing, strict data-handling protocols, and API optimization.</p>
              <div className="project-stack"><span className="tag">Java</span><span className="tag">SQL</span><span className="tag">Docker</span><span className="tag">CI/CD</span><span className="tag">OOP</span></div>
            </div>
            <div className="project-card project-full-width">
              <div className="project-tag">Agentic AI · Automation</div>
              <div className="project-name">AZNext Workflow Engine</div>
              <p className="project-desc">Autonomous state machine that tracks operational data in real-time, identifies anti-patterns, and dynamically extracts and structures ambiguous business information - eliminating 15+ hours of manual work weekly across the organization.</p>
              <div className="project-stack"><span className="tag">Python</span><span className="tag">Agentic AI</span><span className="tag">State Machines</span><span className="tag">Data Analysis</span><span className="tag">OpenAI API</span></div>
            </div>
          </div>
        </div>
      </section>

      <section id="stack">
        <div className="container">
          <div className="section-header"><span className="section-num">03</span><span className="section-icon"><i className="ph ph-stack" aria-hidden="true" /></span><h2 className="section-title">Stack</h2><div className="section-line" /></div>

          <div className="skills-grid">
            <div className="skill-group"><div className="skill-group-label">Languages</div><div className="skill-list"><span className="tag">Python</span><span className="tag">Java</span><span className="tag">R</span><span className="tag">MATLAB</span><span className="tag">SQL</span><span className="tag">TypeScript</span><span className="tag">C++</span></div></div>
            <div className="skill-group"><div className="skill-group-label">AI &amp; Machine Learning</div><div className="skill-list"><span className="tag">PyTorch</span><span className="tag">TensorFlow</span><span className="tag">CNNs / RNNs</span><span className="tag">RAG</span><span className="tag">Agentic AI</span><span className="tag">LLM Orchestration</span></div></div>
            <div className="skill-group"><div className="skill-group-label">Web &amp; Frameworks</div><div className="skill-list"><span className="tag">React</span><span className="tag">Node.js</span><span className="tag">Django</span><span className="tag">REST / Graph APIs</span><span className="tag">Citrus</span></div></div>
          </div>

          <div className="skills-grid">
            <div className="skill-group"><div className="skill-group-label">Cloud &amp; DevOps</div><div className="skill-list"><span className="tag">AWS EC2/RDS</span><span className="tag">Docker</span><span className="tag">Kubernetes</span><span className="tag">CI/CD</span><span className="tag">Git</span><span className="tag">Google Pub/Sub</span></div></div>
            <div className="skill-group"><div className="skill-group-label">Data Science &amp; Eng</div><div className="skill-list"><span className="tag">Pandas / NumPy</span><span className="tag">Matplotlib</span><span className="tag">MS Fabric</span><span className="tag">Tableau</span><span className="tag">BigQuery</span><span className="tag">ETL Pipelines</span></div></div>
            <div className="skill-group"><div className="skill-group-label">Enterprise</div><div className="skill-list"><span className="tag">Salesforce CRM</span><span className="tag">Microsoft 365</span><span className="tag">Agile / Scrum</span><span className="tag">Financial Modeling</span><span className="tag">Cross-functional</span></div></div>
          </div>
        </div>
      </section>

      <section id="orbital">
        <div id="orbital-header"><span className="orb-num">04</span><span className="orb-title">Orbital</span></div>
        <div id="orbital-meta"><div id="orbital-id">you are: -</div><div id="orbital-count">objects in field: 0</div></div>
        <canvas id="orb-canvas" />
        <div id="orb-hint">click + drag to launch · shared with every visitor</div>
      </section>

      <section id="terminal">
        <div className="container">
          <div className="section-header"><span className="section-num">05</span><span className="section-icon"><i className="ph ph-terminal-window" aria-hidden="true" /></span><h2 className="section-title">Terminal</h2><div className="section-line" /></div>
          <div className="terminal-wrap">
            <div className="term-bar"><div className="term-dot r" /><div className="term-dot y" /><div className="term-dot g" /><div className="term-title">chakshu@dev ~ ask me anything</div></div>
            <div className="term-body" id="termBody">
              <div className="term-line"><span className="term-prompt">$</span><span className="term-user">whoami</span></div>
              <div className="term-ai-line">Chakshu Jain. Software engineer, data scientist, automation builder.</div>
              <div className="term-ai-line">Currently building AI outreach systems at EECPLL and managing $50k at DevLabs.</div>
              <div className="term-ai-line accent-line">Type anything - I&apos;ll answer as Chakshu.</div>
            </div>
            <div className="term-input-row"><span className="term-input-prompt">$</span><input className="term-input" id="termInput" placeholder="ask something..." autoComplete="off" spellCheck="false" /></div>
            <div className="term-hint-bar">Try: <span>skills</span> · <span>projects</span> · <span>what do you automate</span> · <span>where are you from</span></div>
          </div>
        </div>
      </section>

      <section id="listening">
        <div className="container">
          <div className="section-header"><span className="section-num">06</span><span className="section-icon"><i className="ph ph-music-notes" aria-hidden="true" /></span><h2 className="section-title">Listening</h2><div className="section-line" /></div>
          <a href="/music" className="music-teaser">
            <div className="music-teaser-left">
              <div className="music-teaser-label">Current rotation.</div>
              <div className="music-teaser-sub">weekly rotation pulled live from last.fm/user/chakshujain</div>
              <div className="music-teaser-note" id="teaser-note"><span className="signal-inline" aria-hidden="true"><i /><i /><i /></span>syncing weekly artists...</div>
              <div className="music-teaser-artists" id="teaser-artists" />
            </div>
            <div className="music-teaser-arrow">Open /music <i className="ph ph-arrow-up-right" aria-hidden="true" /></div>
          </a>
        </div>
      </section>

      <section id="trails">
        <div className="container">
          <div className="section-header"><span className="section-num">07</span><span className="section-icon"><i className="ph ph-mountains" aria-hidden="true" /></span><h2 className="section-title">Trails</h2><div className="section-line" /></div>
          {mostRecent && featuredGpxData ? (
            <TrailsTeaserClient
              hike={mostRecent}
              trail={featuredGpxData.trail}
              snapshotPositions={snapshotPositions}
              trailsLogged={trailsLogged}
              totalMiles={Math.round(totalMiles * 10) / 10}
              totalElevation={Math.round(totalElevation / 1000) * 1000}
              statesVisited={statesVisited}
              allHikes={allHikes}
            />
          ) : (
            <div className="trails-teaser trails-empty-state">Trails data unavailable right now.</div>
          )}
        </div>
      </section>

      <section id="booking">
        <div className="container">
          <div className="section-header"><span className="section-num">08</span><span className="section-icon"><i className="ph ph-calendar-blank" aria-hidden="true" /></span><h2 className="section-title">Book a call</h2><div className="section-line" /></div>
          <div className="cal-card">
            <div>
              <div className="cal-tag">30 min</div>
              <div className="cal-title">Let&apos;s talk.<br />Pick a time.</div>
              <p className="cal-subtitle">Whether it&apos;s a project, collab, or just a technical conversation - my calendar is open.</p>
            </div>
            <a className="btn-cal" href="https://cal.com/chakshujain" target="_blank" rel="noopener noreferrer">Open calendar <i className="ph ph-arrow-up-right" aria-hidden="true" /></a>
          </div>
        </div>
      </section>

      <section id="contact" className="contact-section">
        <div className="container">
          <div className="section-header"><span className="section-num">09</span><span className="section-icon"><i className="ph ph-address-book" aria-hidden="true" /></span><h2 className="section-title">Contact</h2><div className="section-line" /></div>
          <div className="contact-grid">
            <div>
              <div className="contact-tagline">Let&apos;s build something <span className="accent">real.</span></div>
              <p className="contact-copy">Currently based in Tempe, AZ. Open to internships, collaborations, and interesting problems.</p>
            </div>
            <div className="contact-links">
              <a className="contact-link-item" href="mailto:chakshuvinayjain@gmail.com"><span className="contact-link-left"><i className="ph-light ph-envelope-simple icon-inline" aria-hidden="true" /><span>chakshuvinayjain@gmail.com</span></span><span>↗</span></a>
              <a className="contact-link-item" href="https://linkedin.com/in/chakshu-jain-281307243" target="_blank" rel="noopener noreferrer"><span className="contact-link-left"><i className="ph-light ph-linkedin-logo icon-inline" aria-hidden="true" /><span>linkedin.com/in/chakshu-jain-281307243</span></span><span>↗</span></a>
              <a className="contact-link-item" href="https://github.com/FornaxChemica" target="_blank" rel="noopener noreferrer"><span className="contact-link-left"><i className="ph-light ph-github-logo icon-inline" aria-hidden="true" /><span>github.com/FornaxChemica</span></span><span>↗</span></a>
            </div>
          </div>
        </div>
      </section>

      <div id="now-playing-bar" className="now-playing-bar">
        <div className="np-pulse" />
        <div id="np-art" className="np-art" />
        <div className="np-main">
          <div id="np-label" className="np-label">now playing</div>
          <div className="np-meta"><span id="np-track" className="np-track">-</span><span className="np-sep">·</span><span id="np-artist" className="np-artist">-</span></div>
          <div id="np-note" className="np-note" />
        </div>
        <div className="np-eq" id="np-eq" />
        <a id="np-spotify-link" className="np-spotify-link" href="#" target="_blank" rel="noopener noreferrer">open in spotify <i className="ph ph-arrow-up-right" aria-hidden="true" /></a>
      </div>

      <footer><p>© 2025 Chakshu Jain - chakshu.dev</p><div className="status-dot"><span className="dot" />Open to work · Tempe, AZ</div></footer>

      <HomeUiClient />
      <MusicClient />
      <OrbitalClient />
    </main>
  );
}
