import type { ProjectLogo, ProjectsPageRepo } from "../types/projects";

function faviconForUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    if (!host) return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
  } catch {
    return null;
  }
}

/** Optional admin logo → GitHub/homepage URL favicon → GitHub mark. */
export function resolveProjectLogo(repo: ProjectsPageRepo): ProjectLogo {
  const title = repo.displayName || repo.name;

  if (repo.logoUrl?.trim()) {
    return { kind: "image", src: repo.logoUrl.trim(), alt: `${title} logo` };
  }

  // Featured override first, then the Website URL from the GitHub repo (e.g. chakshu.dev).
  const liveUrl = repo.homepageUrl || repo.homepage;
  if (liveUrl?.trim()) {
    const favicon = faviconForUrl(liveUrl.trim());
    if (favicon) return { kind: "image", src: favicon, alt: `${title} logo` };
  }

  return { kind: "github" };
}
