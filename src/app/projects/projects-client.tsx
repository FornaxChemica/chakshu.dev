"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { resolveProjectLogo } from "../../../lib/project-logo";
import type { ProjectsPageRepo } from "../../../types/projects";
import styles from "./projects.module.css";

type ProjectsClientProps = {
  repos: ProjectsPageRepo[];
  error: string | null;
};

type SortMode = "featured" | "updated" | "stars" | "name";

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const delta = Date.now() - then;
  const minutes = Math.floor(delta / 60000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 45) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 18) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 98 96" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
      />
    </svg>
  );
}

function ProjectLogoBadge({ repo }: { repo: ProjectsPageRepo }) {
  const logo = resolveProjectLogo(repo);
  const [failed, setFailed] = useState(false);

  if (logo.kind === "github" || failed) {
    return (
      <span className={`${styles.logoBadge} ${styles.logoBadgeGithub}`} aria-hidden="true">
        <GitHubMark className={styles.logoGithubIcon} />
      </span>
    );
  }

  return (
    <span className={styles.logoBadge} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logo.src}
        alt=""
        className={styles.logoImage}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

export default function ProjectsClient({ repos, error }: ProjectsClientProps) {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<string>("all");
  const [sort, setSort] = useState<SortMode>("featured");
  const [featuredFirst, setFeaturedFirst] = useState(true);

  const languages = useMemo(() => {
    const counts = new Map<string, number>();
    for (const repo of repos) {
      if (!repo.language) continue;
      counts.set(repo.language, (counts.get(repo.language) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));
  }, [repos]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = repos.filter((repo) => {
      if (language !== "all" && repo.language !== language) return false;
      if (!q) return true;
      const haystack = [
        repo.name,
        repo.displayName ?? "",
        repo.description ?? "",
        repo.overrideDescription ?? "",
        repo.tag ?? "",
        repo.language ?? "",
        ...repo.topics,
        ...repo.stack,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    list = [...list].sort((a, b) => {
      if (featuredFirst || sort === "featured") {
        if (a.featured !== b.featured) return a.featured ? -1 : 1;
        if (a.featured && b.featured) {
          const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
          const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
          if (ao !== bo) return ao - bo;
        }
      }

      if (sort === "stars") return b.stargazersCount - a.stargazersCount;
      if (sort === "name") {
        const an = (a.displayName || a.name).toLowerCase();
        const bn = (b.displayName || b.name).toLowerCase();
        return an.localeCompare(bn);
      }

      const at = a.pushedAt ? new Date(a.pushedAt).getTime() : 0;
      const bt = b.pushedAt ? new Date(b.pushedAt).getTime() : 0;
      return bt - at;
    });

    return list;
  }, [repos, query, language, sort, featuredFirst]);

  return (
    <div className={styles.root}>
      <nav className={styles.nav}>
        <div className={styles.navTitle}>/projects</div>
        <Link href="/" className={styles.navBack}>
          ← back to chakshu.dev
        </Link>
      </nav>

      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <h1 className={styles.heroTitle}>Projects</h1>
          <p className={styles.heroSub}>
            Everything public on GitHub — curated featured work first, the rest searchable.
          </p>

          <div className={styles.controls}>
            <label className={styles.searchWrap}>
              <span className={styles.srOnly}>Search projects</span>
              <input
                className={styles.search}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, stack, topic…"
                autoComplete="off"
                spellCheck={false}
              />
            </label>

            <div className={styles.controlRow}>
              <label className={styles.selectLabel}>
                Sort
                <select
                  className={styles.select}
                  value={sort}
                  onChange={(event) => setSort(event.target.value as SortMode)}
                >
                  <option value="featured">Featured / updated</option>
                  <option value="updated">Recently updated</option>
                  <option value="stars">Stars</option>
                  <option value="name">Name</option>
                </select>
              </label>

              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={featuredFirst}
                  onChange={(event) => setFeaturedFirst(event.target.checked)}
                />
                Featured first
              </label>

              <div className={styles.count}>
                {filtered.length} / {repos.length}
              </div>
            </div>
          </div>

          <div className={styles.langRow} role="list">
            <button
              type="button"
              className={`${styles.langChip} ${language === "all" ? styles.langChipActive : ""}`}
              onClick={() => setLanguage("all")}
            >
              All
            </button>
            {languages.map((entry) => (
              <button
                key={entry.name}
                type="button"
                className={`${styles.langChip} ${language === entry.name ? styles.langChipActive : ""}`}
                onClick={() => setLanguage(entry.name)}
              >
                {entry.name}
                <span>{entry.count}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className={styles.main}>
        {error ? (
          <div className={styles.empty}>
            <p>Couldn’t load GitHub repos.</p>
            <p className={styles.emptyHint}>{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <p>No projects match that filter.</p>
            <p className={styles.emptyHint}>Try another language or clear the search.</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {filtered.map((repo) => {
              const title = repo.displayName || repo.name;
              const description = repo.overrideDescription || repo.description || "No description yet.";
              const demoUrl = repo.homepageUrl || repo.homepage;
              const primaryHref = demoUrl || repo.htmlUrl;

              return (
                <article
                  key={repo.fullName}
                  className={`${styles.card} ${repo.featured ? styles.cardFeatured : ""}`}
                >
                  <div className={styles.cardTop}>
                    {repo.featured ? <span className={styles.featuredBadge}>Featured</span> : null}
                    {repo.tag ? <span className={styles.tag}>{repo.tag}</span> : null}
                    {repo.fork ? <span className={styles.metaBadge}>Fork</span> : null}
                    {repo.archived ? <span className={styles.metaBadge}>Archived</span> : null}
                  </div>

                  <div className={styles.cardTitleRow}>
                    <ProjectLogoBadge repo={repo} />
                    <a
                      className={styles.cardNameLink}
                      href={primaryHref}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <h2 className={styles.cardName}>{title}</h2>
                      <span className={styles.cardNameArrow} aria-hidden="true">
                        ↗
                      </span>
                    </a>
                  </div>

                  <p className={styles.cardDesc}>{description}</p>

                  {repo.stack.length > 0 ? (
                    <div className={styles.stack}>
                      {repo.stack.map((item) => (
                        <span key={item} className={styles.stackTag}>
                          {item}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className={styles.cardMeta}>
                    <span>{repo.language || "—"}</span>
                    <span>★ {repo.stargazersCount}</span>
                    <span>{relativeTime(repo.pushedAt)}</span>
                  </div>

                  <div className={styles.cardLinks}>
                    <a href={repo.htmlUrl} target="_blank" rel="noopener noreferrer">
                      GitHub ↗
                    </a>
                    {demoUrl ? (
                      <a href={demoUrl} target="_blank" rel="noopener noreferrer">
                        Live ↗
                      </a>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
