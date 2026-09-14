"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { githubDefaultsForAdmin } from "../../../lib/project-enrichment";
import type { FeaturedProject, GitHubRepo } from "../../../types/projects";
import styles from "./admin.module.css";

type DraftProject = {
  repoName: string;
  featured: boolean;
  sortOrder: string;
  displayName: string;
  tag: string;
  description: string;
  stackText: string;
  homepageUrl: string;
  logoUrl: string;
  language: string | null;
  htmlUrl: string;
  githubDescription: string | null;
  defaults: ReturnType<typeof githubDefaultsForAdmin>;
};

type LoadState =
  | { status: "loading"; message: string }
  | { status: "ready"; message: string }
  | { status: "error"; message: string };

type SaveState =
  | { status: "idle"; message: string }
  | { status: "loading"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

function toDraft(repo: GitHubRepo, featured: FeaturedProject | undefined): DraftProject {
  const defaults = githubDefaultsForAdmin(repo);
  return {
    repoName: repo.name,
    featured: featured?.featured === true,
    sortOrder: String(featured?.sortOrder ?? 0),
    displayName: featured?.displayName?.trim() || defaults.displayName,
    tag: featured?.tag?.trim() || defaults.tag,
    description: featured?.description?.trim() || defaults.description,
    stackText: featured?.stack?.length ? featured.stack.join(", ") : defaults.stackText,
    homepageUrl: featured?.homepageUrl?.trim() || defaults.homepageUrl,
    logoUrl: featured?.logoUrl ?? "",
    language: repo.language,
    htmlUrl: repo.htmlUrl,
    githubDescription: repo.description,
    defaults,
  };
}

export default function AdminProjectsPanel() {
  const [drafts, setDrafts] = useState<DraftProject[]>([]);
  const [query, setQuery] = useState("");
  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    message: "Loading GitHub + D1…",
  });
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle", message: "" });

  const load = useCallback(async () => {
    setLoadState({ status: "loading", message: "Loading GitHub + D1…" });
    try {
      const response = await fetch("/api/admin/projects");
      const payload = (await response.json()) as {
        error?: string;
        featured?: FeaturedProject[];
        repos?: GitHubRepo[];
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load projects.");
      }

      const featuredByName = new Map(
        (payload.featured ?? []).map((row) => [row.repoName.toLowerCase(), row])
      );
      const nextDrafts = (payload.repos ?? []).map((repo) =>
        toDraft(repo, featuredByName.get(repo.name.toLowerCase()))
      );
      setDrafts(nextDrafts);
      setLoadState({
        status: "ready",
        message: `${nextDrafts.length} public repos · ${
          nextDrafts.filter((draft) => draft.featured).length
        } featured`,
      });
    } catch (error) {
      setLoadState({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to load projects.",
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = drafts.filter((draft) => {
      if (!q) return true;
      return [draft.repoName, draft.displayName, draft.tag, draft.description, draft.language ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

    return [...list].sort((a, b) => {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      const ao = Number(a.sortOrder) || 0;
      const bo = Number(b.sortOrder) || 0;
      if (ao !== bo) return ao - bo;
      return a.repoName.localeCompare(b.repoName);
    });
  }, [drafts, query]);

  function updateDraft(repoName: string, patch: Partial<DraftProject>) {
    setDrafts((prev) =>
      prev.map((draft) => (draft.repoName === repoName ? { ...draft, ...patch } : draft))
    );
  }

  function toggleFeatured(repoName: string, featured: boolean) {
    setDrafts((prev) =>
      prev.map((draft) => {
        if (draft.repoName !== repoName) return draft;
        if (!featured) return { ...draft, featured: false };
        return {
          ...draft,
          featured: true,
          displayName: draft.displayName.trim() || draft.defaults.displayName,
          tag: draft.tag.trim() || draft.defaults.tag,
          description: draft.description.trim() || draft.defaults.description,
          stackText: draft.stackText.trim() || draft.defaults.stackText,
          homepageUrl: draft.homepageUrl.trim() || draft.defaults.homepageUrl,
        };
      })
    );
  }

  function resetFromGitHub(repoName: string) {
    setDrafts((prev) =>
      prev.map((draft) => {
        if (draft.repoName !== repoName) return draft;
        return {
          ...draft,
          displayName: draft.defaults.displayName,
          tag: draft.defaults.tag,
          description: draft.defaults.description,
          stackText: draft.defaults.stackText,
          homepageUrl: draft.defaults.homepageUrl,
        };
      })
    );
  }

  async function saveFeatured() {
    setSaveState({ status: "loading", message: "Saving featured set…" });
    const projects = drafts
      .filter((draft) => draft.featured)
      .map((draft, index) => ({
        repoName: draft.repoName,
        sortOrder: Number(draft.sortOrder) || index,
        featured: true,
        displayName: draft.displayName.trim() || null,
        tag: draft.tag.trim() || null,
        description: draft.description.trim() || null,
        stack: draft.stackText
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        homepageUrl: draft.homepageUrl.trim() || null,
        logoUrl: draft.logoUrl.trim() || null,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder);

    try {
      const response = await fetch("/api/admin/projects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projects }),
      });
      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Save failed.");
      }
      setSaveState({
        status: "success",
        message: payload.message ?? "Saved featured projects.",
      });
      await load();
    } catch (error) {
      setSaveState({
        status: "error",
        message: error instanceof Error ? error.message : "Save failed.",
      });
    }
  }

  return (
    <div className={styles.projectsPanel}>
      <div className={styles.formHeader}>
        <div>
          <div className={styles.kicker}>Projects</div>
          <h1 className={styles.formTitle}>Featured curation</h1>
          <p className={styles.formSubtitle}>
            Fields are prefilled from GitHub (description, language, topics). Edit to override;
            empty values fall back to GitHub on the site.
          </p>
        </div>
        <button type="button" className={styles.primaryBtn} onClick={() => void saveFeatured()}>
          Save featured
        </button>
      </div>

      <div className={styles.projectsToolbar}>
        <input
          className={styles.input}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter repos…"
        />
        <div className={styles.projectsStatus} data-status={loadState.status}>
          {loadState.message}
        </div>
        {saveState.message ? (
          <div className={styles.projectsStatus} data-status={saveState.status}>
            {saveState.message}
          </div>
        ) : null}
      </div>

      {loadState.status === "error" ? (
        <div className={styles.projectsEmpty}>{loadState.message}</div>
      ) : (
        <div className={styles.projectsList}>
          {filtered.map((draft) => (
            <article
              key={draft.repoName}
              className={`${styles.projectRow} ${draft.featured ? styles.projectRowFeatured : ""}`}
            >
              <div className={styles.projectRowHead}>
                <label className={styles.projectFeaturedToggle}>
                  <input
                    type="checkbox"
                    checked={draft.featured}
                    onChange={(event) => toggleFeatured(draft.repoName, event.target.checked)}
                  />
                  Featured
                </label>
                <a href={draft.htmlUrl} target="_blank" rel="noopener noreferrer">
                  {draft.repoName} ↗
                </a>
                <span className={styles.projectLang}>{draft.language || "—"}</span>
              </div>

              {draft.featured ? (
                <div className={styles.projectFields}>
                  <label>
                    Sort
                    <input
                      className={styles.input}
                      value={draft.sortOrder}
                      onChange={(event) =>
                        updateDraft(draft.repoName, { sortOrder: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Display name
                    <input
                      className={styles.input}
                      value={draft.displayName}
                      onChange={(event) =>
                        updateDraft(draft.repoName, { displayName: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Tag
                    <input
                      className={styles.input}
                      value={draft.tag}
                      onChange={(event) => updateDraft(draft.repoName, { tag: event.target.value })}
                    />
                  </label>
                  <label className={styles.projectFieldWide}>
                    Description
                    <textarea
                      className={styles.textarea}
                      value={draft.description}
                      onChange={(event) =>
                        updateDraft(draft.repoName, { description: event.target.value })
                      }
                      rows={3}
                    />
                  </label>
                  <label className={styles.projectFieldWide}>
                    Stack (comma-separated)
                    <input
                      className={styles.input}
                      value={draft.stackText}
                      onChange={(event) =>
                        updateDraft(draft.repoName, { stackText: event.target.value })
                      }
                    />
                  </label>
                  <label className={styles.projectFieldWide}>
                    Homepage / demo URL
                    <input
                      className={styles.input}
                      value={draft.homepageUrl}
                      onChange={(event) =>
                        updateDraft(draft.repoName, { homepageUrl: event.target.value })
                      }
                      placeholder="https://"
                    />
                  </label>
                  <label className={styles.projectFieldWide}>
                    Logo URL (optional — live sites auto-use favicon; else GitHub mark)
                    <input
                      className={styles.input}
                      value={draft.logoUrl}
                      onChange={(event) =>
                        updateDraft(draft.repoName, { logoUrl: event.target.value })
                      }
                      placeholder="/favicon.png or https://…"
                    />
                  </label>
                  <div className={styles.projectFieldWide}>
                    <button
                      type="button"
                      className={styles.resetGithubBtn}
                      onClick={() => resetFromGitHub(draft.repoName)}
                    >
                      Reset fields from GitHub
                    </button>
                  </div>
                </div>
              ) : (
                <p className={styles.projectGithubDesc}>
                  {draft.githubDescription || "No GitHub description."}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
