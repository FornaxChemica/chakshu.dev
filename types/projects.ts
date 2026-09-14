export type FeaturedProject = {
  repoName: string;
  sortOrder: number;
  featured: boolean;
  displayName: string | null;
  tag: string | null;
  description: string | null;
  stack: string[];
  homepageUrl: string | null;
  logoUrl: string | null;
};

export type GitHubRepo = {
  name: string;
  fullName: string;
  description: string | null;
  htmlUrl: string;
  language: string | null;
  stargazersCount: number;
  fork: boolean;
  archived: boolean;
  topics: string[];
  pushedAt: string | null;
  homepage: string | null;
};

export type ProjectsPageRepo = GitHubRepo & {
  featured: boolean;
  displayName: string | null;
  tag: string | null;
  overrideDescription: string | null;
  stack: string[];
  homepageUrl: string | null;
  logoUrl: string | null;
  sortOrder: number | null;
};

export type FeaturedProjectInput = {
  repoName: string;
  sortOrder: number;
  featured?: boolean;
  displayName?: string | null;
  tag?: string | null;
  description?: string | null;
  stack?: string[];
  homepageUrl?: string | null;
  logoUrl?: string | null;
};

export type ProjectLogo =
  | { kind: "image"; src: string; alt: string }
  | { kind: "github" };
