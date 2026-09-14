import type { GitHubRepo } from "../types/projects";

const GITHUB_USER = "FornaxChemica";

type GitHubApiRepo = {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  fork: boolean;
  archived: boolean;
  topics?: string[];
  pushed_at: string | null;
  homepage: string | null;
};

function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

function mapRepo(repo: GitHubApiRepo): GitHubRepo {
  return {
    name: repo.name,
    fullName: repo.full_name,
    description: repo.description,
    htmlUrl: repo.html_url,
    language: repo.language,
    stargazersCount: repo.stargazers_count,
    fork: repo.fork,
    archived: repo.archived,
    topics: repo.topics ?? [],
    pushedAt: repo.pushed_at,
    homepage: repo.homepage,
  };
}

export async function fetchPublicRepos(username = GITHUB_USER): Promise<GitHubRepo[]> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "chakshu.dev-portfolio",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  const repos: GitHubRepo[] = [];
  let url: string | null =
    `https://api.github.com/users/${encodeURIComponent(username)}/repos?type=public&per_page=100&sort=updated`;

  while (url) {
    const response = await fetch(url, {
      headers,
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error ${response.status}: ${await response.text()}`);
    }

    const page = (await response.json()) as GitHubApiRepo[];
    for (const repo of page) repos.push(mapRepo(repo));
    url = parseNextLink(response.headers.get("link"));
  }

  return repos;
}
