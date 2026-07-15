import Link from "next/link";
import { notFound } from "next/navigation";
import Navigation from "@/components/Navigation";
import ProjectsMap from "@/components/ProjectsMap";
import { projects } from "@/data/projects";
import { formatArea, formatDistance } from "@/lib/format";
import { findPdmSource } from "@/lib/pdm-sources";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = projects.find((candidate) => candidate.id === id);

  if (!project) {
    notFound();
  }

  const pdmSource = findPdmSource(project.municipality);
  const pdmAvailable = pdmSource?.type === "wms";

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <div className="flex min-h-screen">
        <Navigation />
        <main className="flex-1 bg-zinc-50 p-8 lg:p-12">
          <div className="mx-auto max-w-5xl">
            <Link
              href="/projects"
              className="text-sm font-medium text-zinc-500 transition hover:text-zinc-900"
            >
              ← Back to projects
            </Link>

            <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.3em] text-zinc-500">
                    Project
                  </p>
                  <h1 className="mt-3 text-3xl font-semibold tracking-tight">
                    {project.name}
                  </h1>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.3em] text-zinc-600">
                    {project.status}
                  </span>
                  <a
                    href={`/api/planta-sig?projectId=${project.id}&format=pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-zinc-700"
                  >
                    Generate Location Plan
                  </a>
                  {pdmAvailable ? (
                    <a
                      href={`/api/pdm-extrato?projectId=${project.id}&format=pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-zinc-700"
                    >
                      Generate PDM Extract
                    </a>
                  ) : (
                    <span
                      title={pdmSource?.type === "unavailable" ? pdmSource.reason : undefined}
                      className="cursor-not-allowed rounded-full border border-zinc-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400"
                    >
                      PDM Extract Unavailable
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
                    Status
                  </p>
                  <p className="mt-2 text-sm font-medium text-zinc-900">
                    {project.status}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
                    Last updated
                  </p>
                  <p className="mt-2 text-sm font-medium text-zinc-900">
                    {project.updatedAt}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
                    Center point
                  </p>
                  <p className="mt-2 text-sm font-medium text-zinc-900">
                    {project.center.lat.toFixed(4)}°, {project.center.lng.toFixed(4)}°
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
                    Municipality
                  </p>
                  <p className="mt-2 text-sm font-medium text-zinc-900">
                    {project.municipality}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
                    Size
                  </p>
                  <p className="mt-2 text-sm font-medium text-zinc-900">
                    {formatDistance(project.size.widthKm)} × {formatDistance(project.size.heightKm)}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
                    Area
                  </p>
                  <p className="mt-2 text-sm font-medium text-zinc-900">
                    {formatArea(project.size.areaKm2)}
                  </p>
                </div>
              </div>

              <div className="mt-8 h-[420px] overflow-hidden rounded-xl border border-zinc-200">
                <ProjectsMap projects={[project]} />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
