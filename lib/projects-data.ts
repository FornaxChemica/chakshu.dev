import projectsLocal from "../data/projects.json";
import type {
  FeaturedProject,
  FeaturedProjectInput,
  ProjectsPageRepo,
} from "../types/projects";
import { fetchPublicRepos } from "./github-repos";

type D1ResultSet<T> = {
  results?: T[];
};

type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  all: <T>() => Promise<D1ResultSet<T>>;
  run: () => Promise<unknown>;
};

type D1DatabaseLike = {
  prepare: (query: string) => D1Statement;
  batch?: (statements: D1Statement[]) => Promise<unknown>;
};

type CloudflareEnvLike = {
  HIKES_DB?: D1DatabaseLike;
};

type FeaturedProjectRow = {
  repo_name: string;
  sort_order: number | string;
  featured: number | string;
  display_name: string | null;
  tag: string | null;
  description: string | null;
  stack_json: string | null;
  homepage_url: string | null;
  logo_url: string | null;
};

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseStack(input: string | null | undefined): string[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item)).filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeFeatured(row: {
  repoName: string;
  sortOrder: number;
  featured: boolean;
  displayName: string | null;
  tag: string | null;
  description: string | null;
  stack: string[];
  homepageUrl: string | null;
  logoUrl: string | null;
}): FeaturedProject {
  return {
    repoName: row.repoName,
    sortOrder: row.sortOrder,
    featured: row.featured,
    displayName: row.displayName,
    tag: row.tag,
    description: row.description,
    stack: row.stack,
    homepageUrl: row.homepageUrl,
    logoUrl: row.logoUrl,
  };
}

function mapRow(row: FeaturedProjectRow): FeaturedProject {
  return normalizeFeatured({
    repoName: row.repo_name,
    sortOrder: toNumber(row.sort_order, 0),
    featured: toNumber(row.featured, 0) === 1,
    displayName: row.display_name,
    tag: row.tag,
    description: row.description,
    stack: parseStack(row.stack_json),
    homepageUrl: row.homepage_url,
    logoUrl: row.logo_url ?? null,
  });
}

function fallbackFeaturedProjects(): FeaturedProject[] {
  return (projectsLocal as FeaturedProjectInput[]).map((item, index) =>
    normalizeFeatured({
      repoName: item.repoName,
      sortOrder: item.sortOrder ?? index,
      featured: item.featured !== false,
      displayName: item.displayName ?? null,
      tag: item.tag ?? null,
      description: item.description ?? null,
      stack: item.stack ?? [],
      homepageUrl: item.homepageUrl ?? null,
      logoUrl: item.logoUrl ?? null,
    })
  );
}

async function getCloudflareEnv(options?: { requireFlag?: boolean }): Promise<CloudflareEnvLike | null> {
  const requireFlag = options?.requireFlag !== false;
  if (requireFlag && process.env.USE_D1_HIKES !== "1") return null;

  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const context = await getCloudflareContext({ async: true });
    return (context?.env as CloudflareEnvLike) ?? null;
  } catch {
    return null;
  }
}

const FEATURED_SELECT = `
  SELECT
    repo_name,
    sort_order,
    featured,
    display_name,
    tag,
    description,
    stack_json,
    homepage_url,
    logo_url
  FROM featured_projects
`;

async function loadFeaturedFromD1(): Promise<FeaturedProject[] | null> {
  const env = await getCloudflareEnv();
  const db = env?.HIKES_DB;
  if (!db) return null;

  try {
    const rows =
      (
        await db
          .prepare(`${FEATURED_SELECT} WHERE featured = 1 ORDER BY sort_order ASC, repo_name ASC`)
          .all<FeaturedProjectRow>()
      ).results ?? [];
    return rows.map(mapRow);
  } catch {
    return null;
  }
}

async function loadAllFeaturedRowsFromD1(): Promise<FeaturedProject[] | null> {
  const env = await getCloudflareEnv({ requireFlag: false });
  const db = env?.HIKES_DB;
  if (!db) return null;

  try {
    const rows =
      (
        await db
          .prepare(`${FEATURED_SELECT} ORDER BY sort_order ASC, repo_name ASC`)
          .all<FeaturedProjectRow>()
      ).results ?? [];
    return rows.map(mapRow);
  } catch {
    return null;
  }
}

export async function getFeaturedProjects(): Promise<FeaturedProject[]> {
  const fromD1 = await loadFeaturedFromD1();
  if (fromD1 !== null) return fromD1;
  return fallbackFeaturedProjects().filter((project) => project.featured);
}

export async function getAllFeaturedProjectRows(): Promise<FeaturedProject[]> {
  const fromD1 = await loadAllFeaturedRowsFromD1();
  if (fromD1 !== null) return fromD1;
  return fallbackFeaturedProjects();
}

export async function getProjectsPageData(): Promise<ProjectsPageRepo[]> {
  const [repos, featuredRows] = await Promise.all([
    fetchPublicRepos(),
    getAllFeaturedProjectRows(),
  ]);

  const featuredByName = new Map(featuredRows.map((row) => [row.repoName.toLowerCase(), row]));

  return repos.map((repo) => {
    const featured = featuredByName.get(repo.name.toLowerCase());
    return {
      ...repo,
      featured: featured?.featured === true,
      displayName: featured?.displayName ?? null,
      tag: featured?.tag ?? null,
      overrideDescription: featured?.description ?? null,
      stack: featured?.stack ?? [],
      homepageUrl: featured?.homepageUrl ?? null,
      logoUrl: featured?.logoUrl ?? null,
      sortOrder: featured?.featured ? featured.sortOrder : null,
    };
  });
}

export async function replaceFeaturedProjects(
  projects: FeaturedProjectInput[]
): Promise<FeaturedProject[]> {
  const env = await getCloudflareEnv({ requireFlag: false });
  const db = env?.HIKES_DB;
  if (!db) {
    throw new Error("Missing D1 binding: HIKES_DB");
  }

  const now = new Date().toISOString();
  const normalized = projects.map((project, index) =>
    normalizeFeatured({
      repoName: project.repoName.trim(),
      sortOrder: project.sortOrder ?? index,
      featured: project.featured !== false,
      displayName: project.displayName?.trim() || null,
      tag: project.tag?.trim() || null,
      description: project.description?.trim() || null,
      stack: project.stack ?? [],
      homepageUrl: project.homepageUrl?.trim() || null,
      logoUrl: project.logoUrl?.trim() || null,
    })
  );

  await db.prepare("DELETE FROM featured_projects").run();

  for (const project of normalized) {
    await db
      .prepare(
        `
        INSERT INTO featured_projects (
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .bind(
        project.repoName,
        project.sortOrder,
        project.featured ? 1 : 0,
        project.displayName,
        project.tag,
        project.description,
        JSON.stringify(project.stack),
        project.homepageUrl,
        project.logoUrl,
        now
      )
      .run();
  }

  return normalized.filter((project) => project.featured);
}
