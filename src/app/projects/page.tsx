import type { Metadata } from "next";

import { getProjectsPageData } from "../../../lib/projects-data";
import type { ProjectsPageRepo } from "../../../types/projects";
import ProjectsClient from "./projects-client";

export const metadata: Metadata = {
  title: "Projects - Chakshu Jain",
  description: "Public GitHub projects by Chakshu Jain, with curated featured work.",
};

export default async function ProjectsPage() {
  let repos: ProjectsPageRepo[] = [];
  let error: string | null = null;

  try {
    repos = await getProjectsPageData();
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load GitHub projects.";
  }

  return <ProjectsClient repos={repos} error={error} />;
}
