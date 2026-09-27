import { docsUrl, independenceNote, kitUrl, productName, tagline } from "~/site";

export default function Home() {
  return (
    <main className="page">
      <p className="eyebrow">Hello.</p>
      <h1>{productName}</h1>
      <p className="lede">{tagline}</p>
      <p>
        A System One model like Jev answers yes or no, picks one option, or scores against a rubric, and says how sure
        it is. {productName} turns that confidence into an action: act, send to a person, fall back, or ask a larger
        model. Every run records what it cost and what it saved.
      </p>
      <nav className="links" aria-label="Get started">
        <a href={docsUrl}>Read the docs</a>
        <a href={kitUrl}>Get the free kit</a>
      </nav>
      <p className="soon">The hosted console is coming. Early access opens here soon.</p>
      <footer>{independenceNote}</footer>
    </main>
  );
}
