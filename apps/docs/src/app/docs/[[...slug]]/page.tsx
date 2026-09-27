import { Callout } from "fumadocs-ui/components/callout";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { createRelativeLink } from "fumadocs-ui/mdx";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OpenAPIPage } from "~/components/api-page";
import { getMDXComponents } from "~/components/mdx";
import { SiteNote } from "~/components/site-note";
import { apiPageOperations, source } from "~/lib/source";

interface Props {
  params: Promise<{ slug?: string[] }>;
}

export default async function Page(props: Props) {
  const { slug } = await props.params;
  const page = source.getPage(slug);
  if (!page) notFound();

  if (page.type === "openapi") {
    const { label } = apiPageOperations(page);
    return (
      <DocsPage full toc={page.data.toc}>
        <DocsTitle>{page.data.title}</DocsTitle>
        <DocsDescription className="mb-0">{page.data.description}</DocsDescription>
        <DocsBody>
          <Callout type="warn" title={`Available from ${label}`}>
            The HTTP API is not live yet. These endpoints are the planned contract, generated from the
            same schema the server will use. Paths and fields can still change before they ship.
          </Callout>
          <OpenAPIPage {...page.data.getOpenAPIPageProps()} />
          <SiteNote />
        </DocsBody>
      </DocsPage>
    );
  }

  const MDX = page.data.body;
  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={getMDXComponents({ a: createRelativeLink(source, page) })} />
        <SiteNote />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { slug } = await props.params;
  const page = source.getPage(slug);
  if (!page) notFound();
  return {
    title: page.data.title,
    description: page.data.description,
  };
}
