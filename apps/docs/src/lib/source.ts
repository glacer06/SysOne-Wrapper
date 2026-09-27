import { loader } from "fumadocs-core/source";
import { apiDocument, findOperations, phaseLabel } from "./api-spec";
import { docs } from "./collections";
import { openapi } from "./openapi";

export const docsRoute = "/docs";
export const apiDir = "api";

export const source = loader(
  {
    docs: docs.toFumadocsSource(),
    // One page per tag under /docs/api, generated from packages/core/openapi.json.
    openapi: await openapi.staticSource({ baseDir: apiDir, per: "tag" }),
  },
  {
    baseUrl: docsRoute,
    plugins: [openapi.loaderPlugin()],
  },
);

export type DocsPage = NonNullable<ReturnType<typeof source.getPage>>;

/** The API operations on a generated API page, with the phase they arrive in. */
export function apiPageOperations(page: DocsPage): { label: string; lines: string[] } {
  if (page.type !== "openapi") return { label: "", lines: [] };
  const doc = apiDocument();
  const ops = findOperations(doc, page.data.getOpenAPIPageProps().operations ?? []);
  return {
    label: phaseLabel(ops.map((o) => o.op)),
    lines: ops.map((o) => `- \`${o.method} ${o.path}\`${o.op.summary ? `: ${o.op.summary}` : ""}`),
  };
}
