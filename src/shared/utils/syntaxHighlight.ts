import type { CodeLanguage } from "../../domain/files/fileLanguage";

export type SyntaxTokenKind =
  | "plain"
  | "comment"
  | "string"
  | "number"
  | "keyword"
  | "type"
  | "function"
  | "tag"
  | "attribute"
  | "property"
  | "operator"
  | "punctuation";

export interface SyntaxToken {
  kind: SyntaxTokenKind;
  value: string;
}

interface LanguageRules {
  keywords: Set<string>;
  types: Set<string>;
  lineComments: string[];
  blockComments: Array<[string, string]>;
  quotes: string[];
}

const wordSet = (words: string) => new Set(words.split(/\s+/u).filter(Boolean));
const COMMON_TYPES = wordSet("Array Boolean Date Error Map Number Object Promise Record RegExp Set String Symbol Uint8Array bigint boolean never null number object string undefined unknown void");
const EMPTY_SET = new Set<string>();

const LANGUAGE_RULES: Record<CodeLanguage, LanguageRules> = {
  javascript: {
    keywords: wordSet("async await break case catch class const continue debugger default delete do else export extends finally for from function get if import in instanceof let new of return set static super switch this throw try typeof var while with yield true false null undefined"),
    types: COMMON_TYPES,
    lineComments: ["//"], blockComments: [["/*", "*/"]], quotes: ["'", "\"", "`"],
  },
  typescript: {
    keywords: wordSet("abstract as asserts async await break case catch class const constructor continue declare default delete do else enum export extends finally for from function get if implements import in infer instanceof interface is keyof let namespace new of override private protected public readonly return satisfies set static super switch this throw try type typeof var while with yield true false null undefined"),
    types: new Set([...COMMON_TYPES, ...wordSet("any bigint boolean never number string unknown void")]),
    lineComments: ["//"], blockComments: [["/*", "*/"]], quotes: ["'", "\"", "`"],
  },
  json: { keywords: wordSet("true false null"), types: EMPTY_SET, lineComments: [], blockComments: [], quotes: ["\""] },
  css: {
    keywords: wordSet("important inherit initial revert unset from to var calc clamp grid flex block inline none absolute relative fixed sticky"),
    types: EMPTY_SET, lineComments: [], blockComments: [["/*", "*/"]], quotes: ["'", "\""],
  },
  html: { keywords: wordSet("DOCTYPE"), types: EMPTY_SET, lineComments: [], blockComments: [["<!--", "-->"]], quotes: ["'", "\""] },
  python: {
    keywords: wordSet("and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield"),
    types: wordSet("bool bytes dict float int list object set str tuple type"),
    lineComments: ["#"], blockComments: [], quotes: ["'", "\""],
  },
  rust: {
    keywords: wordSet("as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while"),
    types: wordSet("bool char f32 f64 i8 i16 i32 i64 i128 isize str u8 u16 u32 u64 u128 usize Option Result String Vec"),
    lineComments: ["//"], blockComments: [["/*", "*/"]], quotes: ["'", "\""],
  },
  shell: {
    keywords: wordSet("case do done elif else esac export fi for function if in local readonly return set source then time trap unset until while"),
    types: EMPTY_SET, lineComments: ["#"], blockComments: [], quotes: ["'", "\"", "`"],
  },
  yaml: { keywords: wordSet("true false null yes no on off"), types: EMPTY_SET, lineComments: ["#"], blockComments: [], quotes: ["'", "\""] },
  toml: { keywords: wordSet("true false"), types: EMPTY_SET, lineComments: ["#"], blockComments: [], quotes: ["'", "\""] },
  sql: {
    keywords: wordSet("ADD ALL ALTER AND AS ASC BEGIN BETWEEN BY CASE CHECK COLUMN COMMIT CONSTRAINT CREATE DATABASE DEFAULT DELETE DESC DISTINCT DROP ELSE END EXISTS FOREIGN FROM FULL GROUP HAVING IF IN INDEX INNER INSERT INTO IS JOIN KEY LEFT LIKE LIMIT NOT NULL ON OR ORDER OUTER PRIMARY REFERENCES RIGHT ROLLBACK SELECT SET TABLE THEN UNION UNIQUE UPDATE VALUES VIEW WHEN WHERE WITH"),
    types: wordSet("BIGINT BOOLEAN CHAR DATE DECIMAL FLOAT INT INTEGER JSON NUMERIC REAL SERIAL TEXT TIME TIMESTAMP VARCHAR"),
    lineComments: ["--"], blockComments: [["/*", "*/"]], quotes: ["'", "\"", "`"],
  },
  go: {
    keywords: wordSet("break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var true false nil"),
    types: wordSet("bool byte complex64 complex128 error float32 float64 int int8 int16 int32 int64 rune string uint uint8 uint16 uint32 uint64 uintptr"),
    lineComments: ["//"], blockComments: [["/*", "*/"]], quotes: ["'", "\"", "`"],
  },
  java: {
    keywords: wordSet("abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null"),
    types: wordSet("Boolean Byte Character Double Float Integer Long Object Short String Void"),
    lineComments: ["//"], blockComments: [["/*", "*/"]], quotes: ["'", "\""],
  },
  swift: {
    keywords: wordSet("as associatedtype break case catch class continue default defer deinit do else enum extension fallthrough false fileprivate for func guard if import in init inout internal is let nil open operator private protocol public repeat rethrows return self Self static struct subscript super switch throw throws true try typealias var where while"),
    types: wordSet("Any Array Bool Character Dictionary Double Error Float Int Never Optional Set String UInt Void"),
    lineComments: ["//"], blockComments: [["/*", "*/"]], quotes: ["\""],
  },
  markdown: { keywords: EMPTY_SET, types: EMPTY_SET, lineComments: [], blockComments: [["<!--", "-->"]], quotes: ["`"] },
  plaintext: { keywords: EMPTY_SET, types: EMPTY_SET, lineComments: [], blockComments: [], quotes: [] },
};

const MAX_HIGHLIGHT_LENGTH = 250_000;
const IDENTIFIER_START = /[A-Za-z_$]/u;
const IDENTIFIER_PART = /[\w$-]/u;
const NUMBER_START = /\d/u;
const OPERATOR = /[+\-*/%=!<>|&^~?:]/u;
const PUNCTUATION = /[()[\]{},.;]/u;

function appendToken(tokens: SyntaxToken[], kind: SyntaxTokenKind, value: string) {
  if (!value) return;
  const previous = tokens[tokens.length - 1];
  if (previous?.kind === kind) previous.value += value;
  else tokens.push({ kind, value });
}

function startsWithOneOf(source: string, index: number, candidates: string[]): string | null {
  return candidates.find((candidate) => source.startsWith(candidate, index)) ?? null;
}

function nextNonWhitespace(source: string, index: number): string {
  while (index < source.length && /\s/u.test(source[index])) index += 1;
  return source[index] ?? "";
}

function previousNonWhitespace(source: string, index: number): string {
  index -= 1;
  while (index >= 0 && /\s/u.test(source[index])) index -= 1;
  return source[index] ?? "";
}

/** Produces safe text tokens; React remains responsible for escaping all source content. */
export function highlightCode(source: string, language: CodeLanguage): SyntaxToken[] {
  if (!source || language === "plaintext" || source.length > MAX_HIGHLIGHT_LENGTH) {
    return [{ kind: "plain", value: source }];
  }

  const rules = LANGUAGE_RULES[language];
  const tokens: SyntaxToken[] = [];
  let index = 0;

  while (index < source.length) {
    const blockComment = rules.blockComments.find(([start]) => source.startsWith(start, index));
    if (blockComment) {
      const endIndex = source.indexOf(blockComment[1], index + blockComment[0].length);
      const stop = endIndex < 0 ? source.length : endIndex + blockComment[1].length;
      appendToken(tokens, "comment", source.slice(index, stop));
      index = stop;
      continue;
    }

    const lineComment = startsWithOneOf(source, index, rules.lineComments);
    if (lineComment) {
      const endIndex = source.indexOf("\n", index + lineComment.length);
      const stop = endIndex < 0 ? source.length : endIndex;
      appendToken(tokens, "comment", source.slice(index, stop));
      index = stop;
      continue;
    }

    const quote = startsWithOneOf(source, index, rules.quotes);
    if (quote) {
      let stop = index + quote.length;
      while (stop < source.length) {
        if (source[stop] === "\\") {
          stop += 2;
          continue;
        }
        if (source.startsWith(quote, stop)) {
          stop += quote.length;
          break;
        }
        if (source[stop] === "\n" && quote !== "`") break;
        stop += 1;
      }
      appendToken(tokens, "string", source.slice(index, stop));
      index = stop;
      continue;
    }

    const character = source[index];
    if (NUMBER_START.test(character)) {
      let stop = index + 1;
      while (stop < source.length && /[\w.]/u.test(source[stop])) stop += 1;
      appendToken(tokens, "number", source.slice(index, stop));
      index = stop;
      continue;
    }

    if (IDENTIFIER_START.test(character)) {
      let stop = index + 1;
      while (stop < source.length && IDENTIFIER_PART.test(source[stop])) stop += 1;
      const word = source.slice(index, stop);
      const previous = previousNonWhitespace(source, index);
      const next = nextNonWhitespace(source, stop);
      let kind: SyntaxTokenKind = "plain";
      if (rules.keywords.has(word) || rules.keywords.has(word.toUpperCase())) kind = "keyword";
      else if (language === "html" && (previous === "<" || previous === "/")) kind = "tag";
      else if (language === "html" && next === "=") kind = "attribute";
      else if (language === "css" && next === ":") kind = "property";
      else if (rules.types.has(word) || /^[A-Z][A-Za-z0-9_$]*$/u.test(word)) kind = "type";
      else if (next === "(") kind = "function";
      appendToken(tokens, kind, word);
      index = stop;
      continue;
    }

    if (OPERATOR.test(character)) appendToken(tokens, "operator", character);
    else if (PUNCTUATION.test(character)) appendToken(tokens, "punctuation", character);
    else appendToken(tokens, "plain", character);
    index += 1;
  }

  return tokens;
}
