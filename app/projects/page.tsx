"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navigation from "@/components/Navigation";
import ProjectsMap from "@/components/ProjectsMap";
import { projects } from "@/data/projects";

export default function ProjectsPage() {
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <div className="flex min-h-screen">
        <Navigation />
        <main className="flex-1 bg-zinc-50 p-8 lg:p-12">
          <div className="mx-auto max-w-7xl">
            <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.3em] text-zinc-500">
                    Projects
                  </p>
                  <h1 className="mt-3 text-3xl font-semibold tracking-tight">
                    All projects
                  </h1>
                </div>
                <Link
                  href="/projects/create"
                  className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-700"
                >
                  New project
                </Link>
              </div>
              <div className="mt-8 grid gap-6 lg:grid-cols-5">
                <div className="lg:col-span-3">
                  {projects.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-12 text-center">
                      <p className="text-sm font-medium text-zinc-600">
                        No projects yet.
                      </p>
                      <p className="mt-1 text-sm text-zinc-500">
                        Create your first project to get started.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-zinc-200">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                          <tr>
                            <th className="px-4 py-3">Name</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Center</th>
                            <th className="px-4 py-3">Last updated</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200">
                          {projects.map((project) => (
                            <tr
                              key={project.id}
                              onClick={() => router.push(`/projects/${project.id}`)}
                              className="cursor-pointer hover:bg-zinc-50"
                            >
                              <td className="px-4 py-3 font-medium text-zinc-900">
                                <Link
                                  href={`/projects/${project.id}`}
                                  className="hover:underline"
                                >
                                  {project.name}
                                </Link>
                              </td>
                              <td className="px-4 py-3 text-zinc-600">
                                {project.status}
                              </td>
                              <td className="px-4 py-3 text-zinc-600">
                                {project.center.lat.toFixed(4)}, {project.center.lng.toFixed(4)}
                              </td>
                              <td className="px-4 py-3 text-zinc-600">
                                {project.updatedAt}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div className="lg:col-span-2">
                  <div className="h-[420px] overflow-hidden rounded-xl border border-zinc-200 lg:sticky lg:top-8 lg:h-[560px]">
                    {isClient ? <ProjectsMap projects={projects} /> : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
