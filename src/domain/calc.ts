import { parseAmountToMinor } from './money';

/**
 * Amount maths for quick add, the amount field and the keypad: "250+120/2", "3 x 45", "2k+500".
 * Numbers are worked in minor units (paise) so nothing is ever a float; multiplication and division
 * come before addition and subtraction, and every product or quotient rounds half up to the paisa.
 */

export type CalcResult = { ok: true; minor: number } | { ok: false; error: string };

/** One number as typed: digits with optional commas and decimals, an optional k (thousand). */
export const CALC_NUMBER = String.raw`\d[\d,]*(?:\.\d+)?k?`;
/** Operators people type for maths: plus, minus (hyphen or the minus sign), times and divide. */
export const CALC_OPERATOR = String.raw`[-+*/x×÷−]`;

/** True when the text has at least one operator between two numbers. */
export function looksLikeMaths(text: string): boolean {
  return new RegExp(`${CALC_NUMBER}\\s*${CALC_OPERATOR}\\s*${CALC_NUMBER}`, 'i').test(text);
}

type Op = '+' | '-' | '*' | '/';
const OPS: Record<string, Op> = {
  '+': '+',
  '-': '-',
  '−': '-',
  '*': '*',
  x: '*',
  X: '*',
  '×': '*',
  '/': '/',
  '÷': '/',
};

function numberMinor(token: string): number | null {
  const kilo = /k$/i.test(token);
  const minor = parseAmountToMinor(kilo ? token.slice(0, -1) : token);
  if (minor === null) return null;
  return kilo ? minor * 1000 : minor;
}

const roundDiv = (a: number, b: number): number => {
  // Half up for positive values, symmetric for negative ones; inputs are integers.
  const q = Math.round(Math.abs(a) / Math.abs(b));
  return Math.sign(a) * Math.sign(b) * q;
};

/** Evaluates an amount expression. Plain numbers work too ("250" is 250). */
export function evaluateAmount(text: string): CalcResult {
  const source = text.replace(/\s+/g, '');
  if (!source) return { ok: false, error: 'Enter an amount' };
  const re = new RegExp(`(${CALC_NUMBER})|(${CALC_OPERATOR})`, 'giy');
  const numbers: number[] = [];
  const ops: Op[] = [];
  let expectNumber = true;
  let pos = 0;
  while (pos < source.length) {
    re.lastIndex = pos;
    const m = re.exec(source);
    if (!m) return { ok: false, error: 'That sum has something Ledger cannot read' };
    pos = re.lastIndex;
    if (m[1] !== undefined && expectNumber) {
      const n = numberMinor(m[1]);
      if (n === null) return { ok: false, error: 'That sum has a number Ledger cannot read' };
      numbers.push(n);
      expectNumber = false;
    } else if (m[2] !== undefined && !expectNumber) {
      ops.push(OPS[m[2]]!);
      expectNumber = true;
    } else {
      return { ok: false, error: 'Finish the sum, for example 250+120' };
    }
  }
  if (expectNumber) return { ok: false, error: 'Finish the sum, for example 250+120' };

  // First pass: times and divide, left to right.
  const terms: number[] = [numbers[0]!];
  const addOps: Op[] = [];
  for (let i = 0; i < ops.length; i += 1) {
    const op = ops[i]!;
    const n = numbers[i + 1]!;
    if (op === '*') {
      const product = terms[terms.length - 1]! * n;
      if (!Number.isSafeInteger(product)) return { ok: false, error: 'That amount is too large' };
      terms[terms.length - 1] = roundDiv(product, 100);
    } else if (op === '/') {
      if (n === 0) return { ok: false, error: 'Cannot divide by zero' };
      terms[terms.length - 1] = roundDiv(terms[terms.length - 1]! * 100, n);
    } else {
      terms.push(n);
      addOps.push(op);
    }
  }
  let total = terms[0]!;
  for (let i = 0; i < addOps.length; i += 1)
    total = addOps[i] === '+' ? total + terms[i + 1]! : total - terms[i + 1]!;
  if (!Number.isSafeInteger(total)) return { ok: false, error: 'That amount is too large' };
  if (total <= 0) return { ok: false, error: 'That sum comes to zero or less' };
  return { ok: true, minor: total };
}
