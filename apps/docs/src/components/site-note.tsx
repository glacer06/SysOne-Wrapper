import { independenceNote, typesafeDocsUrl } from "~/site";

/** The note at the foot of every page: who makes this product, and where the model docs are. */
export function SiteNote() {
  return (
    <p className="mt-12 border-t pt-4 text-sm text-fd-muted-foreground">
      {independenceNote} For the System One models themselves, see{" "}
      <a href={typesafeDocsUrl} className="underline">
        {typesafeDocsUrl.replace("https://", "")}
      </a>
      .
    </p>
  );
}
