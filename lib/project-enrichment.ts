import type { FeaturedProject, GitHubRepo } from "../types/projects";

function titleCaseTopic(topic: string): string {
  const known: Record<string, string> = {
    macos: "macOS",
    ios: "iOS",
    typescript: "TypeScript",
    javascript: "JavaScript",
    nextjs: "Next.js",
    "next-js": "Next.js",
    nodejs: "Node.js",
    "node-js": "Node.js",
    openai: "OpenAI",
    llm: "LLM",
    ai: "AI",
    ml: "ML",
    api: "API",
    cli: "CLI",
    ui: "UI",
    ux: "UX",
    cpp: "C++",
    "c-plus-plus": "C++",
  };

  const key = topic.toLowerCase();
  if (known[key]) return known[key];

  return topic
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Tag line from GitHub topics + language, e.g. "Swift · macOS". */
export function deriveProjectTag(repo: Pick<GitHubRepo, "language" | "topics">): string | null {
  const topics = (repo.topics ?? []).slice(0, 2).map(titleCaseTopic);
  if (topics.length >= 2) return `${topics[0]} · ${topics[1]}`;
  if (topics.length === 1 && repo.language) {
    if (topics[0].toLowerCase() === repo.language.toLowerCase()) return repo.language;
    return `${repo.language} · ${topics[0]}`;
  }
  if (topics.length === 1) return topics[0];
  if (repo.language) return repo.language;
  return null;
}

/** Stack chips from language + topics. */
export function deriveProjectStack(repo: Pick<GitHubRepo, "language" | "topics">): string[] {
  const items: string[] = [];
  const seen = new Set<string>();

  const push = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    items.push(trimmed);
  };

  push(repo.language);
  for (const topic of repo.topics ?? []) {
    push(titleCaseTopic(topic));
    if (items.length >= 6) break;
  }

  return items;
}

/** Merge D1 overrides with live GitHub metadata when fields are empty. */
export function enrichFeaturedWithGitHub(
  featured: FeaturedProject,
  repo: GitHubRepo | undefined
): FeaturedProject {
  if (!repo) {
    return {
      ...featured,
      displayName: featured.displayName || featured.repoName,
    };
  }

  const stack = featured.stack.length > 0 ? featured.stack : deriveProjectStack(repo);

  return {
    ...featured,
    displayName: featured.displayName?.trim() || repo.name,
    description: featured.description?.trim() || repo.description,
    tag: featured.tag?.trim() || deriveProjectTag(repo),
    stack,
    homepageUrl: featured.homepageUrl?.trim() || repo.homepage,
  };
}

export function githubDefaultsForAdmin(repo: GitHubRepo): {
  displayName: string;
  tag: string;
  description: string;
  stackText: string;
  homepageUrl: string;
} {
  return {
    displayName: repo.name,
    tag: deriveProjectTag(repo) ?? "",
    description: repo.description ?? "",
    stackText: deriveProjectStack(repo).join(", "),
    homepageUrl: repo.homepage ?? "",
  };
}
