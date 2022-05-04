import { parse } from "shell-quote";
import { AutoCompleteFunc } from "./types";

/**
 * Detects all the word boundaries on the given input
 */
export function wordBoundaries(input: string, leftSide: boolean = true) {
  let match;
  const words = [];
  const rx = /\w+/g;

  while ((match = rx.exec(input))) {
    if (leftSide) {
      words.push(match.index);
    } else {
      words.push(match.index + match[0].length);
    }
  }

  return words;
}

/**
 * The closest left (or right) word boundary of the given input at the
 * given offset.
 */
export function closestLeftBoundary(input: string, offset: number) {
  const found = wordBoundaries(input, true)
    .reverse()
    .find(x => x < offset);
  return found == null ? 0 : found;
}
export function closestRightBoundary(input: string, offset: number) {
  const found = wordBoundaries(input, false).find(x => x > offset);
  return found == null ? input.length : found;
}

/**
 * Convert offset at the given input to col/row location
 *
 * This function is not optimized and practically emulates via brute-force
 * the navigation on the terminal, wrapping when they reach the column width.
 */
export function offsetToColRow(input: string, offset: number, maxCols: number) {
  let row = 0,
    col = 0;

  for (let i = 0; i < offset; ++i) {
    const chr = input.charAt(i);
    if (chr == "\n") {
      col = 0;
      row += 1;
    } else {
      col += 1;
      if (col > maxCols) {
        col = 0;
        row += 1;
      }
    }
  }

  return { row, col };
}

/**
 * Counts the lines in the given input
 */
export function countLines(input: string, maxCols: number) {
  return offsetToColRow(input, input.length, maxCols).row + 1;
}

/**
 * Checks if there is an incomplete input
 *
 * An incomplete input is considered:
 * - An input that contains unterminated single quotes
 * - An input that contains unterminated double quotes
 * - An input that ends with "\"
 * - An input that has an incomplete boolean shell expression (&& and ||)
 * - An incomplete pipe expression (|)
 */
export function isIncompleteInput(input: string) {
  // Empty input is not incomplete
  if (input.trim() == "") {
    return false;
  }

  // Check for dangling single-quote strings
  if ((input.match(/'/g) || []).length % 2 !== 0) {
    return true;
  }
  // Check for dangling double-quote strings
  if ((input.match(/"/g) || []).length % 2 !== 0) {
    return true;
  }
  // Check for dangling boolean or pipe operations
  if (
    input
      .split(/(\|\||\||&&)/g)
      .pop()
      ?.trim() == ""
  ) {
    return true;
  }
  // Check for tailing slash
  if (input.endsWith("\\") && !input.endsWith("\\\\")) {
    return true;
  }

  return false;
}

/**
 * Returns true if the expression ends on a tailing whitespace
 */
export function hasTailingWhitespace(input: string) {
  return input.match(/[^\\][ \t]$/m) != null;
}

/**
 * Returns the last expression in the given input
 */
export function getLastToken(input: string) {
  // Empty expressions
  if (input.trim() === "") return "";
  if (hasTailingWhitespace(input)) return "";

  // Last token
  const tokens = parse(input);
  return tokens.pop() || "";
}

/**
 * Returns the auto-complete candidates for the given input
 */
export async function collectAutocompleteCandidates(callbacks: Array<{ fn: AutoCompleteFunc, args: Array<any> }>, input: string) {
  const tokens = parse(input);
  let index = tokens.length - 1;
  let expr = tokens[index] || "";

  // Empty expressions
  if (input.trim() === "") {
    index = 0;
    expr = "";
  } else if (hasTailingWhitespace(input)) {
    // Expressions with danging space
    index += 1;
    expr = "";
  }

  const results = await Promise.all(callbacks.map(async ({ fn, args }) => {
    const ret = await fn({ index, args, raw: input, expr: expr as string });
    return ret ? ret : [];
  }));
  // Filter only the ones starting with the expression
  return results.flat().filter(txt => txt.startsWith(expr as string));
}


export function getSharedFragment(fragment: string, candidates: Array<any>): string | null {

  // end loop when fragment length = first candidate length
  if (fragment.length >= candidates[0].length) return fragment;

  // save old fragemnt
  const oldFragment = fragment;

  // get new fragment
  fragment += candidates[0].slice(fragment.length, fragment.length + 1);

  for (let i = 0; i < candidates.length; i++) {

    // return null when there's a wrong candidate
    if (!candidates[i].startsWith(oldFragment)) return null;

    if (!candidates[i].startsWith(fragment)) {
      return oldFragment;
    }
  }

  return getSharedFragment(fragment, candidates);
}