// Source rewrites the export applies to the kit copy only. The monorepo files stay as they are.
//
// Comments in the private monorepo point at internal design docs (ADR ids, references/*.md, phase
// checklists). The public repo has none of those, so the export strips the pointers from comments.
// It never touches code: comment ranges come from the TypeScript parser, not from a regex.

import ts from "typescript";

/** Counts of what a rewrite changed, keyed by rule. */
export type RewriteCounts = Record<string, number>;

const bump = (counts: RewriteCounts, rule: string, by = 1): void => {
  counts[rule] = (counts[rule] ?? 0) + by;
};

/** Escape a string for use inside a RegExp. */
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A regex source for one internal pointer: an ADR id, an internal doc name (optionally with a
 * section), a phase checklist or a path into the private skill folder.
 */
export function internalRefSource(internalDocNames: readonly string[]): string {
  const docs = [...new Set(internalDocNames)].map(esc).join("|");
  const section = String.raw`(?:,?\s+(?:section|sections)\s+\d+(?:\.\d+)?(?:\s*(?:and|to|,)\s*\d+(?:\.\d+)?)*)?`;
  const quoted = String.raw`(?:,?\s+"[^"\n]*")?`;
  const parts = [
    String.raw`ADR-\d+(?:\s+Amendment\s+\d+)?(?:'s\s+[A-Z][\w-]*(?:\s+section)?)?${section}`,
    String.raw`(?:\.claude\/[\w./-]*)`,
    String.raw`(?:references\/)?(?:phases\/)?phase-\d+b?\.md${section}`,
    ...(docs === "" ? [] : [String.raw`(?:references\/|(?<![\w/.-]))(?:${docs})${section}${quoted}`]),
    String.raw`golden rule \d+`,
  ];
  return `(?:${parts.join("|")})`;
}

export interface CommentRewriteOptions {
  internalDocNames: readonly string[];
}

/** The comment ranges of a TypeScript or JavaScript source, from the parser. */
export function commentRanges(text: string, fileName: string): ts.CommentRange[] {
  const kind = /\.[cm]?js$/.test(fileName) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const seen = new Map<number, ts.CommentRange>();
  const visit = (node: ts.Node): void => {
    for (const r of ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []) seen.set(r.pos, r);
    for (const r of ts.getTrailingCommentRanges(text, node.getEnd()) ?? []) seen.set(r.pos, r);
    for (const child of node.getChildren(sf)) visit(child);
  };
  visit(sf);
  return [...seen.values()].sort((a, b) => a.pos - b.pos);
}

/** Keep only the line breaks of a removed span, so comment lines stay aligned. */
const keepBreaks = (m: string): string => m.replace(/[^\n]/g, "");

/**
 * Rewrite the prose of a comment body (no comment markers). Line breaks are kept, so the caller
 * can tell which lines became empty. In order:
 * 1. "Source: ..." and "Related: ..." sentences that list internal docs are dropped.
 * 2. A parenthetical that holds an internal pointer is dropped: "(ADR-012)", "(spec-schema.md section 2)".
 * 3. A "see ..." sentence or clause that is only pointers is dropped.
 * 4. A phrase such as "in spec-schema.md" or "from ADR-011" is dropped.
 * 5. "the api.md table" becomes "the documented table".
 * 6. Any pointer still left is replaced by a neutral phrase.
 */
export function rewriteProse(text: string, opts: CommentRewriteOptions, counts: RewriteCounts): string {
  const ref = internalRefSource(opts.internalDocNames);
  const refs = String.raw`${ref}(?:(?:,\s*|,?\s+and\s+)${ref})*`;
  const hasRef = new RegExp(ref);
  let out = text;
  const apply = (rule: string, re: RegExp, to: (m: string, ...groups: string[]) => string): void => {
    out = out.replace(re, (m: string, ...rest: unknown[]) => {
      bump(counts, rule);
      return to(m, ...(rest.filter((g) => typeof g === "string") as string[]));
    });
  };

  // 1. Source lists.
  out = out.replace(/(?:Sources?|Related|See also):\s[\s\S]*?\.(?=\s|$)/g, (m) => {
    if (!hasRef.test(m)) return m;
    bump(counts, "comment.source-list");
    return keepBreaks(m);
  });
  // 2. Parentheticals (they may span lines inside a comment).
  apply("comment.parenthetical", new RegExp(String.raw`[ \t]*\((?:[^()]|\([^()]*\))*?${ref}(?:[^()]|\([^()]*\))*?\)`, "g"), keepBreaks);
  // 3. "See ..." sentences and "; see ..." clauses.
  apply(
    "comment.see-sentence",
    new RegExp(String.raw`(?<=^|[.:!?][ \t]+|\n[ \t*]*)(?:See|Read|Details are in|Defined in|Per)\s+(?:the\s+)?${refs}[^.\n]*\.[ \t]*`, "g"),
    keepBreaks,
  );
  apply("comment.see-clause", new RegExp(String.raw`[;,]\s*(?:see|per|read)\s+(?:the\s+)?${refs}`, "g"), keepBreaks);
  // 4. Prepositional phrases that only point at a doc.
  // Only when the pointer ends the phrase: "in the api.md table" is handled by rule 5.
  apply("comment.phrase", new RegExp(String.raw`[ \t]+(?:in|from|by|per|under|following)\s+(?:the\s+)?${refs}(?![ \t]+[a-z])`, "g"), keepBreaks);
  // 5. "the api.md table".
  apply("comment.the-doc", new RegExp(String.raw`\bthe\s+${ref}`, "g"), (m) => `${keepBreaks(m)}the documented`);
  // 6. Leftovers.
  apply("comment.inline", new RegExp(ref, "g"), (m) => {
    if (/^ADR-/.test(m)) return "a design decision";
    if (/^golden rule/.test(m)) return "a project rule";
    if (/phase-\d/.test(m)) return "the roadmap";
    return "the design docs";
  });
  return out;
}

const isBlankBody = (line: string): boolean => /^[\s*]*$/.test(line);

/**
 * Rewrite a run of comment lines. `lines` are the texts after the comment marker (for `//`) or
 * the lines of a block comment. Returns the new lines; a line that only lost content and is now
 * empty is removed.
 */
function rewriteLines(lines: readonly string[], opts: CommentRewriteOptions, counts: RewriteCounts): string[] {
  const next = rewriteProse(lines.join("\n"), opts, counts).split("\n");
  if (next.length !== lines.length) throw new Error("kit export: a comment rewrite changed the line count");
  const out: string[] = [];
  for (const [i, line] of next.entries()) {
    const before = lines[i] as string;
    if (line === before) {
      out.push(line);
      continue;
    }
    if (isBlankBody(line)) continue;
    let content = line.slice((/^[\s*]*/.exec(line)?.[0] ?? "").length);
    // A removal at the end of the previous line can leave its closing punctuation here.
    const punct = /^([.,;:])[ \t]*/.exec(content);
    if (punct !== null && out.length > 0) {
      out[out.length - 1] = `${(out[out.length - 1] as string).replace(/[ \t]+$/, "")}${punct[1]}`;
      content = content.slice(punct[0].length);
      if (content.trim() === "") continue;
    }
    // Keep the original indent and marker spacing, and the trailing space of "/** text */".
    const lead = /^[\s*]*/.exec(before)?.[0] ?? "";
    const trail = /[ \t]*$/.exec(before)?.[0] ?? "";
    out.push(`${lead}${content.replace(/[ \t]+$/, "")}${trail}`);
  }
  return out;
}

/**
 * Rewrite one block comment (with its markers). Returns null when nothing but markers is left.
 */
export function rewriteBlockComment(comment: string, opts: CommentRewriteOptions, counts: RewriteCounts): string | null {
  const inner = comment.slice(2, -2);
  const next = rewriteLines(inner.split("\n"), opts, counts);
  if (next.join("\n") === inner) return comment;
  if (next.every(isBlankBody)) return null;
  // Collapse blank " *" runs inside the body and drop a blank " *" line just before the closing
  // line. The first line (the "*" of "/**") and the last line (the indent before "*/") stay.
  const kept: string[] = [];
  for (const [i, line] of next.entries()) {
    const inside = i > 0 && i < next.length - 1;
    if (inside && isBlankBody(line) && kept.length > 1 && isBlankBody(kept[kept.length - 1] as string)) continue;
    kept.push(line);
  }
  if (kept.length >= 3 && /^\s*$/.test(kept[kept.length - 1] as string) && isBlankBody(kept[kept.length - 2] as string)) {
    kept.splice(kept.length - 2, 1);
  }
  return `/*${kept.join("\n")}*/`;
}

interface LineGroup {
  /** Start of the first line (for a group of whole-line comments) or of the first comment. */
  start: number;
  end: number;
  /** Indent before each "//". */
  indent: string;
  bodies: string[];
  /** True when every comment stands alone on its line. */
  alone: boolean;
}

/** Rewrite every comment in a TS or JS source. Code is left byte for byte. */
export function rewriteComments(text: string, fileName: string, opts: CommentRewriteOptions, counts: RewriteCounts): string {
  const ranges = commentRanges(text, fileName);
  const edits: Array<{ pos: number; end: number; text: string }> = [];
  const lineStartOf = (pos: number): number => text.lastIndexOf("\n", pos - 1) + 1;
  const lineEndOf = (pos: number): number => {
    const i = text.indexOf("\n", pos);
    return i === -1 ? text.length : i;
  };

  // Group consecutive whole-line `//` comments with the same indent, so a sentence can span them.
  const groups: LineGroup[] = [];
  for (const r of ranges) {
    const raw = text.slice(r.pos, r.end);
    if (r.kind === ts.SyntaxKind.MultiLineCommentTrivia) {
      const next = rewriteBlockComment(raw, opts, counts);
      if (next === raw) continue;
      if (next === null) {
        bump(counts, "comment.deleted");
        const ls = lineStartOf(r.pos);
        const le = lineEndOf(r.end);
        const alone = text.slice(ls, r.pos).trim() === "" && text.slice(r.end, le).trim() === "";
        if (alone) edits.push({ pos: ls, end: Math.min(le + 1, text.length), text: "" });
        else edits.push({ pos: r.pos, end: r.end, text: "" });
      } else edits.push({ pos: r.pos, end: r.end, text: next });
      continue;
    }
    const ls = lineStartOf(r.pos);
    const indent = text.slice(ls, r.pos);
    const alone = indent.trim() === "";
    const prev = groups[groups.length - 1];
    if (alone && prev !== undefined && prev.alone && prev.indent === indent && prev.end + 1 === ls) {
      prev.bodies.push(raw.slice(2));
      prev.end = r.end;
      continue;
    }
    groups.push({ start: alone ? ls : r.pos, end: r.end, indent: alone ? indent : "", bodies: [raw.slice(2)], alone });
  }
  for (const g of groups) {
    const next = rewriteLines(g.bodies, opts, counts);
    if (next.length === g.bodies.length && next.every((b, i) => b === g.bodies[i])) continue;
    if (!g.alone) {
      // A trailing comment after code.
      const body = next[0];
      if (body === undefined) {
        bump(counts, "comment.deleted");
        const ls = lineStartOf(g.start);
        const codeEnd = ls + text.slice(ls, g.start).trimEnd().length;
        edits.push({ pos: codeEnd, end: g.end, text: "" });
      } else edits.push({ pos: g.start, end: g.end, text: `//${body}` });
      continue;
    }
    if (next.length === 0) {
      bump(counts, "comment.deleted");
      edits.push({ pos: g.start, end: Math.min(g.end + 1, text.length), text: "" });
      continue;
    }
    edits.push({ pos: g.start, end: g.end, text: next.map((b) => `${g.indent}//${b}`).join("\n") });
  }
  let out = text;
  for (const e of edits.sort((a, b) => b.pos - a.pos)) out = out.slice(0, e.pos) + e.text + out.slice(e.end);
  return out;
}

/**
 * Rewrite internal pointers in test titles: the first string argument of `it`, `test` and
 * `describe` (with `.each`, `.skip` and the like). Only literal titles are touched.
 */
export function rewriteTestTitles(text: string, fileName: string, opts: CommentRewriteOptions, counts: RewriteCounts): string {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const edits: Array<{ pos: number; end: number; text: string }> = [];
  const isTestCallee = (e: ts.Expression): boolean => {
    if (ts.isIdentifier(e)) return ["it", "test", "describe"].includes(e.text);
    if (ts.isPropertyAccessExpression(e)) return isTestCallee(e.expression);
    if (ts.isCallExpression(e)) return isTestCallee(e.expression);
    return false;
  };
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isTestCallee(node.expression)) {
      const first = node.arguments[0];
      if (first !== undefined && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) {
        const local: RewriteCounts = {};
        const next = rewriteProse(first.text, opts, local).trim();
        if (next !== first.text) {
          for (const [k, v] of Object.entries(local)) bump(counts, k.replace(/^comment\./, "test-title."), v);
          edits.push({ pos: first.getStart(sf), end: first.getEnd(), text: JSON.stringify(next) });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  let out = text;
  for (const e of edits.sort((a, b) => b.pos - a.pos)) out = out.slice(0, e.pos) + e.text + out.slice(e.end);
  return out;
}

/**
 * Remove whole `it(...)` or `describe(...)` statements whose title matches, then drop named
 * imports that are no longer used. For tests that check the code against internal docs.
 */
export function dropTests(text: string, fileName: string, titles: readonly string[]): { text: string; dropped: string[] } {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const cuts: Array<{ pos: number; end: number }> = [];
  const dropped: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
      const call = node.expression;
      const callee = call.expression;
      const first = call.arguments[0];
      if (
        ts.isIdentifier(callee) &&
        ["it", "test", "describe"].includes(callee.text) &&
        first !== undefined &&
        (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) &&
        titles.includes(first.text)
      ) {
        // Take the leading comments and the line with it.
        const start = node.getFullStart();
        const lineEnd = text.indexOf("\n", node.getEnd());
        cuts.push({ pos: start, end: lineEnd === -1 ? text.length : lineEnd });
        dropped.push(first.text);
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  const missing = titles.filter((t) => !dropped.includes(t));
  if (missing.length > 0) throw new Error(`kit export: ${fileName} has no test titled ${missing.map((m) => JSON.stringify(m)).join(", ")}`);
  let out = text;
  for (const c of cuts.sort((a, b) => b.pos - a.pos)) out = out.slice(0, c.pos) + out.slice(c.end);
  return { text: dropUnusedNamedImports(out, fileName), dropped };
}

/** Drop named imports whose local name no longer appears in the file; drop imports left empty. */
export function dropUnusedNamedImports(text: string, fileName: string): string {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const edits: Array<{ pos: number; end: number; text: string }> = [];
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const bindings = stmt.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings) || stmt.importClause?.name !== undefined) continue;
    const rest = text.slice(0, stmt.getStart(sf)) + text.slice(stmt.getEnd());
    const used = bindings.elements.filter((el) => new RegExp(`\\b${esc(el.name.text)}\\b`).test(rest));
    if (used.length === bindings.elements.length) continue;
    const lineEnd = text.indexOf("\n", stmt.getEnd());
    if (used.length === 0) {
      edits.push({ pos: stmt.getStart(sf), end: lineEnd === -1 ? text.length : lineEnd + 1, text: "" });
    } else {
      const names = used.map((el) => el.getText(sf)).join(", ");
      edits.push({ pos: bindings.getStart(sf), end: bindings.getEnd(), text: `{ ${names} }` });
    }
  }
  let out = text;
  for (const e of edits.sort((a, b) => b.pos - a.pos)) out = out.slice(0, e.pos) + e.text + out.slice(e.end);
  return out;
}
