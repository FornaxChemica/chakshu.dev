import profileJson from "../data/terminal-profile.json";
import hikesJson from "../data/hikes.json";
import coursesJson from "../data/terminal-courses.json";

type ProfileFact = {
  text?: string;
  skills?: string[];
  eligible?: boolean;
  verified?: boolean;
};

type ProfileRecord = {
  id?: string;
  kind?: string;
  label?: string;
  title?: string;
  organization?: string;
  location?: string;
  dates?: string;
  status?: string;
  facts?: ProfileFact[];
};

type TerminalProfile = {
  personal?: {
    name?: string;
    email?: string;
    location?: string;
    github?: string;
    linkedin?: string;
    website?: string;
  };
  prohibited_claims?: string[];
  ineligible_claims?: string[];
  records?: ProfileRecord[];
};

type HikeSummary = {
  id?: string;
  name?: string;
  location?: string;
  date?: string;
  distance?: string;
  elevation_gain?: string;
  high_point?: string;
  difficulty?: string;
};

export type ProfileContext = {
  context: string;
  educationTexts: string[];
};

const profile = profileJson as TerminalProfile;
const hikes = (Array.isArray(hikesJson) ? hikesJson : []) as HikeSummary[];

type CourseEntry = {
  code: string;
  name: string;
  grade?: string | null;
};

type SemesterRecord = {
  id: string;
  label: string;
  season: "fall" | "spring" | "summer";
  year: number;
  courses: CourseEntry[];
};

type CoursesFile = {
  current_semester_id: string;
  semesters: SemesterRecord[];
};

const coursesFile = coursesJson as CoursesFile;
const semesters = Array.isArray(coursesFile.semesters) ? coursesFile.semesters : [];
const currentSemesterId = coursesFile.current_semester_id || semesters[semesters.length - 1]?.id;
const KIND_ALIASES: Record<string, string[]> = {
  education: ["education", "school", "university", "college", "degree", "gpa", "asu", "class", "classes", "course", "courses", "semester", "enrolled", "taking"],
  experience: ["experience", "job", "work", "role", "title", "employer", "career", "internship", "automation", "executive", "education", "aznext", "eecpll"],
  project: ["project", "projects", "build", "building", "built", "made", "working on", "portfolio", "github", "quantile", "windowlens", "devtize", "sage", "engagement", "capstone"],
  leadership: ["leadership", "club", "org", "organization", "devlabs", "finance", "treasurer", "vp", "ambassador"],
  skills: ["skill", "skills", "stack", "tech", "language", "languages", "framework", "python", "typescript", "java"],
  honors: ["honor", "honors", "award", "dean", "provost", "scholarship"],
};

const MAX_FACTS = 12;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/i)
    .filter((t) => t.length > 1);
}

function scoreFact(queryTokens: Set<string>, queryLower: string, record: ProfileRecord, fact: ProfileFact): number {
  let score = 0;
  const kind = (record.kind || "").toLowerCase();
  const aliases = KIND_ALIASES[kind] || [];
  for (const alias of aliases) {
    if (queryLower.includes(alias)) score += 4;
  }

  const haystack = [
    record.kind,
    record.label,
    record.title,
    record.organization,
    record.location,
    record.status,
    fact.text,
    ...(fact.skills || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const token of queryTokens) {
    if (haystack.includes(token)) score += 2;
  }

  if (record.status === "current") score += 1;
  return score;
}

function formatRecordHeader(record: ProfileRecord): string {
  const parts = [
    record.title,
    record.organization || record.label,
    record.dates,
    record.status ? `(${record.status})` : "",
  ].filter(Boolean);
  return parts.join(" — ");
}

function formatHikeLine(hike: HikeSummary): string {
  const parts = [
    hike.name,
    hike.location,
    hike.date && hike.date !== "TBD" ? hike.date : null,
    hike.distance,
    hike.elevation_gain ? `${hike.elevation_gain} gain` : null,
    hike.difficulty,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function isHikeQuery(query: string): boolean {
  return /\b(hike|hikes|hiking|trail|trails|outdoor|outdoors|nature|backpack|bryce|zion|sedona|camelback|olympic)\b/i.test(
    query
  );
}

function buildHikesContext(queryLower: string): string | null {
  if (!hikes.length) return null;
  const namedHit = hikes.some((h) => {
    const blob = `${h.name || ""} ${h.location || ""} ${h.id || ""}`.toLowerCase();
    return tokenize(queryLower).some((t) => t.length > 3 && blob.includes(t));
  });
  if (!isHikeQuery(queryLower) && !namedHit) return null;

  const lines = hikes.map((h) => `- ${formatHikeLine(h)}`);
  return [
    "TRAILS / HIKES (from portfolio data — full map + photos on /trails)",
    ...lines,
    `Total logged hikes: ${hikes.length}.`,
  ].join("\n");
}

export function buildProfileContext(query: string): ProfileContext {
  const personal = profile.personal || {};
  const records = Array.isArray(profile.records) ? profile.records : [];
  const queryLower = query.toLowerCase();
  const queryTokens = new Set(tokenize(query));

  const educationTexts: string[] = [];
  type Scored = { score: number; kind: string; header: string; text: string };
  const scored: Scored[] = [];

  for (const record of records) {
    const kind = (record.kind || "other").toLowerCase();
    const header = formatRecordHeader(record);
    for (const fact of record.facts || []) {
      if (fact.eligible === false || fact.verified === false) continue;
      const text = (fact.text || "").trim();
      if (!text) continue;
      if (kind === "education") educationTexts.push(text);
      const score = scoreFact(queryTokens, queryLower, record, fact);
      scored.push({ score, kind, header, text });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const selected =
    scored.filter((s) => s.score > 0).slice(0, MAX_FACTS).length > 0
      ? scored.filter((s) => s.score > 0).slice(0, MAX_FACTS)
      : [
          ...scored.filter((s) => s.kind === "experience").slice(0, 3),
          ...scored.filter((s) => s.kind === "project" && /current/i.test(s.header)).slice(0, 4),
          ...scored.filter((s) => s.kind === "education").slice(0, 2),
          ...scored.filter((s) => s.kind === "leadership").slice(0, 1),
        ].slice(0, MAX_FACTS);

  const byKind = new Map<string, string[]>();
  for (const item of selected) {
    const lines = byKind.get(item.kind) || [];
    const line = item.header ? `${item.header}\n${item.text}` : item.text;
    if (!lines.includes(line)) lines.push(line);
    byKind.set(item.kind, lines);
  }

  const sections: string[] = [];
  sections.push(
    [
      "PERSONAL",
      `Name: ${personal.name || "Chakshu Jain"}`,
      `Location: ${personal.location || "Tempe, AZ"}`,
      "Background: Originally from Beawar, Rajasthan; grew up in Mumbai; now based in Tempe, AZ.",
      personal.email ? `Email: ${personal.email}` : "",
      personal.website ? `Website: ${personal.website}` : "",
      personal.github ? `GitHub: ${personal.github}` : "",
      personal.linkedin ? `LinkedIn: ${personal.linkedin}` : "",
    ]
      .filter(Boolean)
      .join("\n")
  );

  const kindOrder = ["experience", "project", "education", "leadership", "skills", "honors"];
  for (const kind of kindOrder) {
    const lines = byKind.get(kind);
    if (!lines?.length) continue;
    sections.push(`${kind.toUpperCase()}\n${lines.join("\n\n")}`);
  }

  const hikesSection = buildHikesContext(queryLower);
  if (hikesSection) sections.push(hikesSection);

  const coursesSection = buildCoursesContext(queryLower);
  if (coursesSection) sections.push(coursesSection);

  const prohibited = (profile.prohibited_claims || []).filter(Boolean);
  const ineligible = (profile.ineligible_claims || []).filter(Boolean);
  if (prohibited.length) {
    sections.push(`PROHIBITED CLAIMS (never say these)\n- ${prohibited.join("\n- ")}`);
  }
  if (ineligible.length) {
    sections.push(`INELIGIBLE / DO NOT OVERCLAIM\n- ${ineligible.join("\n- ")}`);
  }

  return {
    context: sections.join("\n\n"),
    educationTexts,
  };
}

type CourseItem = { code: string; name: string; level?: string };

function semesterIndex(id: string): number {
  return semesters.findIndex((s) => s.id === id);
}

function getCurrentSemester(): SemesterRecord | null {
  return semesters.find((s) => s.id === currentSemesterId) || semesters[semesters.length - 1] || null;
}

function getRelativeSemester(offset: number): SemesterRecord | null {
  const idx = semesterIndex(currentSemesterId);
  if (idx < 0) return null;
  return semesters[idx + offset] || null;
}

function wantsGrades(query: string): boolean {
  return /\b(grade|grades|gpa|scored|score|how did you do|marks?|transcript)\b/i.test(query);
}

/** e.g. "A", "A+", "C+" — null if not a grade-filter question */
function parseGradeFilter(query: string): { letter: string; exact: boolean } | null {
  const q = query.toLowerCase();
  const end = `(?=\\s|$|[^a-z0-9+])`;

  // Prefer exact A+ / A- / C+ before bare letters
  const exact = q.match(
    new RegExp(
      `\\b(?:grade[sd]?|scored|got|received|earned)\\s+(?:an?\\s+|of\\s+)?([a-f][+-])${end}|\\b([a-f][+-])\\s+grades?\\b|\\b([a-f][+-])\\s+in\\b`,
      "i"
    )
  );
  if (exact) {
    const raw = (exact[1] || exact[2] || exact[3] || "").toUpperCase();
    if (raw) return { letter: raw, exact: true };
  }

  const loose = q.match(
    new RegExp(
      `\\b(?:grade[sd]?|scored|got|received|earned)\\s+(?:an?\\s+|of\\s+)?([a-f])(?![+-])${end}|\\b([a-f])(?![+-])\\s+grades?\\b`,
      "i"
    )
  );
  if (loose) {
    const raw = (loose[1] || loose[2] || "").toUpperCase();
    if (raw && /^[A-F]$/.test(raw)) return { letter: raw, exact: false };
  }

  return null;
}

function gradeMatchesFilter(grade: string | null | undefined, filter: { letter: string; exact: boolean }): boolean {
  if (!grade || grade === "NR") return false;
  const g = grade.toUpperCase();
  if (filter.exact) return g === filter.letter;
  // "A" matches A, A+, A-
  return g === filter.letter || g === `${filter.letter}+` || g === `${filter.letter}-`;
}

function formatCourse(course: CourseEntry, includeGrade: boolean): string {
  const base = `${course.code} ${course.name}`;
  if (!includeGrade) return base;
  if (course.grade == null || course.grade === "") return `${base} (no grade posted)`;
  if (course.grade === "NR") return `${base} (in progress)`;
  return `${base} (${course.grade})`;
}

function formatSemesterCourses(semester: SemesterRecord, includeGrade: boolean): string {
  return semester.courses.map((c) => formatCourse(c, includeGrade)).join("; ");
}

function resolveSemesterFromQuery(query: string): {
  semester: SemesterRecord | null;
  kind: "current" | "next" | "previous" | "named" | "all" | "grade" | "none";
  missingLabel?: string;
  gradeFilter?: { letter: string; exact: boolean };
} {
  const q = query.toLowerCase();
  const gradeFilter = parseGradeFilter(query);

  if (
    /\b(all semesters|every semester|entire transcript|complete list|full (course )?list)\b/i.test(q) ||
    /\ball(?:\s+of)?(?:\s+my)?\s+(?:classes|courses)\b/i.test(q) ||
    /\bevery(?:\s+one)?\s+of\s+(?:my\s+)?(?:classes|courses)\b/i.test(q) ||
    /\blist\s+all\b/i.test(q)
  ) {
    return { semester: null, kind: "all" };
  }

  if (/\bnext semester\b|\bcoming semester\b|\bupcoming semester\b/i.test(q)) {
    const next = getRelativeSemester(1);
    if (next) return { semester: next, kind: "next" };
    const current = getCurrentSemester();
    const guess =
      current?.season === "fall"
        ? `Spring ${current.year + 1}`
        : current?.season === "spring"
          ? `Fall ${current.year}`
          : "the next term";
    return { semester: null, kind: "next", missingLabel: guess };
  }

  if (/\blast semester\b|\bprevious semester\b|\bprior semester\b/i.test(q)) {
    return { semester: getRelativeSemester(-1), kind: "previous", gradeFilter: gradeFilter || undefined };
  }

  const named = q.match(/\b(fall|spring|summer)\s+(20\d{2})\b/i);
  if (named) {
    const season = named[1].toLowerCase() as SemesterRecord["season"];
    const year = Number(named[2]);
    const hit = semesters.find((s) => s.season === season && s.year === year) || null;
    if (hit) return { semester: hit, kind: "named", gradeFilter: gradeFilter || undefined };
    return {
      semester: null,
      kind: "named",
      missingLabel: `${named[1][0].toUpperCase()}${named[1].slice(1).toLowerCase()} ${named[2]}`,
    };
  }

  // Grade filter across the transcript (unless a term was already selected above)
  if (gradeFilter) {
    return { semester: null, kind: "grade", gradeFilter };
  }

  if (
    /\b(this|current)\s+semester\b/i.test(q) ||
    /\bright now\b/i.test(q) ||
    /\bcurrently\s+taking\b/i.test(q) ||
    /\btaking\s+now\b/i.test(q)
  ) {
    return { semester: getCurrentSemester(), kind: "current" };
  }

  // Default course questions → current semester (not the whole catalog)
  if (isCourseQuery(query)) {
    return { semester: getCurrentSemester(), kind: "current" };
  }

  return { semester: null, kind: "none" };
}

function buildCoursesContext(queryLower: string): string | null {
  if (!semesters.length || !isCourseQuery(queryLower)) return null;

  const includeGrade = wantsGrades(queryLower);
  const current = getCurrentSemester();
  const lines: string[] = [
    "COURSEWORK BY SEMESTER (verified transcript-style log)",
    current ? `Current semester: ${current.label} (${current.id}).` : "",
    "When asked about classes, answer for the requested term. Default to the current semester. Do not dump every semester unless asked for all. Omit grades unless the user asks for grades.",
  ].filter(Boolean);

  for (const semester of semesters) {
    lines.push(
      `${semester.label}: ${formatSemesterCourses(semester, includeGrade)}. Total: ${semester.courses.length}.`
    );
  }

  return lines.join("\n");
}

export function isCourseQuery(query: string): boolean {
  return (
    /\b(class|classes|course|courses|taking|enrolled|semester|coursework|transcript)\b/i.test(query) ||
    parseGradeFilter(query) !== null
  );
}

export function deterministicCourseReplyFromProfile(query: string, _educationTexts: string[]): string | null {
  if (!isCourseQuery(query) || !semesters.length) return null;

  const includeGrade = wantsGrades(query);
  const resolved = resolveSemesterFromQuery(query);

  if (resolved.kind === "all") {
    const blocks = semesters.map(
      (s) => `${s.label}: ${formatSemesterCourses(s, includeGrade)} (total ${s.courses.length})`
    );
    const total = semesters.reduce((n, s) => n + s.courses.length, 0);
    return `Semester-by-semester coursework: ${blocks.join(" | ")}. Grand total: ${total} courses.`;
  }

  if (resolved.kind === "next" && !resolved.semester) {
    return `I don't have ${resolved.missingLabel || "next semester"} finalized in my course log yet. Right now I'm in ${getCurrentSemester()?.label || "the current term"} — ask about this semester or a past term like Spring 2026.`;
  }

  // Filter by letter grade across one term or the full log
  if (resolved.gradeFilter || resolved.kind === "grade") {
    const filter = resolved.gradeFilter || parseGradeFilter(query);
    if (!filter) return null;

    const scope = resolved.semester ? [resolved.semester] : semesters;
    const hits: string[] = [];
    for (const semester of scope) {
      for (const course of semester.courses) {
        if (!gradeMatchesFilter(course.grade, filter)) continue;
        hits.push(`${formatCourse(course, true)} — ${semester.label}`);
      }
    }

    const label = filter.exact ? filter.letter : `${filter.letter} / ${filter.letter}+ / ${filter.letter}-`;
    if (!hits.length) {
      const where = resolved.semester ? ` in ${resolved.semester.label}` : "";
      return `No courses${where} with a ${label} grade in my log.`;
    }

    const where = resolved.semester ? ` in ${resolved.semester.label}` : "";
    return `Courses with a ${label} grade${where}: ${hits.join("; ")}. Total: ${hits.length}.`;
  }

  if (!resolved.semester) {
    if (resolved.missingLabel) {
      return `I don't have coursework logged for ${resolved.missingLabel}. Ask about this semester, last semester, or a term like Fall 2025.`;
    }
    return null;
  }

  const semester = resolved.semester;
  const formatted = formatSemesterCourses(semester, includeGrade);
  const total = semester.courses.length;

  if (resolved.kind === "current") {
    return `${semester.label} (current): ${formatted}. Total: ${total}.`;
  }
  if (resolved.kind === "next") {
    return `${semester.label} (next): ${formatted}. Total: ${total}.`;
  }
  if (resolved.kind === "previous") {
    return `${semester.label} (last semester): ${formatted}. Total: ${total}.`;
  }
  return `${semester.label}: ${formatted}. Total: ${total}.`;
}

export function deterministicHikeReply(query: string): string | null {
  if (!isHikeQuery(query) || !hikes.length) return null;

  const queryLower = query.toLowerCase();
  const stop = new Set(["hike", "hikes", "hiking", "trail", "trails", "the", "and", "what", "which", "your", "you", "did", "have", "been", "done", "list", "all"]);
  const tokens = tokenize(queryLower).filter((t) => t.length > 2 && !stop.has(t));

  const matched = hikes.filter((h) => {
    const blob = `${h.name || ""} ${h.location || ""} ${h.id || ""}`.toLowerCase();
    return tokens.some((t) => blob.includes(t));
  });

  const wantsList = /\b(list|all|which|what|favorite|been|done|log)\b/i.test(query);

  if (matched.length === 1 && !wantsList) {
    const h = matched[0];
    const bits = [
      h.name,
      h.location,
      h.date && h.date !== "TBD" ? h.date : null,
      h.distance,
      h.elevation_gain ? `${h.elevation_gain} gain` : null,
      h.difficulty,
    ].filter(Boolean);
    return `${bits.join(" · ")}. More on /trails.`;
  }

  const selected = matched.length ? matched : hikes;
  const formatted = selected
    .map((h) => {
      const where = h.location ? ` (${h.location})` : "";
      const dist = h.distance ? ` — ${h.distance}` : "";
      return `${h.name}${where}${dist}`;
    })
    .join("; ");

  return `Hikes on my log: ${formatted}. Total: ${selected.length}. Full map and photos are on /trails.`;
}

export function hikeFallbackSummary(): string {
  if (!hikes.length) {
    return "I hike whenever I can. Check /trails for the full log.";
  }
  const dated = hikes.find((h) => h.date && h.date !== "TBD");
  const highlight = dated || hikes[0];
  const names = hikes
    .slice(0, 4)
    .map((h) => h.name)
    .filter(Boolean)
    .join(", ");
  const more = hikes.length > 4 ? `, plus ${hikes.length - 4} more` : "";
  const highlightBit = highlight?.name
    ? ` Highlight: ${highlight.name}${highlight.location ? ` in ${highlight.location}` : ""}.`
    : "";
  return `I log hikes on this site — ${names}${more}.${highlightBit} Full map + photos on /trails.`;
}
