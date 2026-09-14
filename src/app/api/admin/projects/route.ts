import { NextRequest, NextResponse } from "next/server";

import { auth } from "../../../../../lib/auth";
import { fetchPublicRepos } from "../../../../../lib/github-repos";
import {
  getAllFeaturedProjectRows,
  replaceFeaturedProjects,
} from "../../../../../lib/projects-data";
import type { FeaturedProjectInput } from "../../../../../types/projects";

export const runtime = "nodejs";

function isAllowedAdmin(email: string | null): boolean {
  if (!email) return false;
  const allowlist = (process.env.ADMIN_EMAIL_ALLOWLIST ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.length === 0 || allowlist.includes(email);
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  const email = session?.user?.email?.toLowerCase() ?? null;
  if (!isAllowedAdmin(email)) {
    return NextResponse.json({ error: "Unauthorized admin account." }, { status: 401 });
  }

  try {
    const [featured, repos] = await Promise.all([
      getAllFeaturedProjectRows(),
      fetchPublicRepos(),
    ]);

    return NextResponse.json({ featured, repos });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load projects admin data.",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  const email = session?.user?.email?.toLowerCase() ?? null;
  if (!isAllowedAdmin(email)) {
    return NextResponse.json({ error: "Unauthorized admin account." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const projectsRaw =
    body && typeof body === "object" && "projects" in body
      ? (body as { projects: unknown }).projects
      : null;

  if (!Array.isArray(projectsRaw)) {
    return NextResponse.json({ error: "Expected { projects: [...] }." }, { status: 400 });
  }

  const projects: FeaturedProjectInput[] = [];
  for (const item of projectsRaw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const repoName = String(row.repoName ?? "").trim();
    if (!repoName) continue;

    const stack = Array.isArray(row.stack)
      ? row.stack.map((value) => String(value).trim()).filter(Boolean)
      : String(row.stackText ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);

    projects.push({
      repoName,
      sortOrder: Number(row.sortOrder ?? projects.length) || 0,
      featured: row.featured !== false && row.featured !== 0,
      displayName: row.displayName == null ? null : String(row.displayName),
      tag: row.tag == null ? null : String(row.tag),
      description: row.description == null ? null : String(row.description),
      stack,
      homepageUrl: row.homepageUrl == null ? null : String(row.homepageUrl),
      logoUrl: row.logoUrl == null ? null : String(row.logoUrl),
    });
  }

  try {
    const saved = await replaceFeaturedProjects(projects);
    return NextResponse.json({
      message: `Saved ${saved.length} featured project${saved.length === 1 ? "" : "s"}.`,
      featured: saved,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to save featured projects.",
      },
      { status: 500 }
    );
  }
}
