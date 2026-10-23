import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import hi from './hi.json';
import te from './te.json';

/** Every text the interface translates: the first argument of tl(), tr() and msg() in src. */
function keysInSource(): Map<string, string> {
  const root = join(__dirname, '..');
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
      d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)],
    );
  const keys = new Map<string, string>();
  for (const file of walk(root).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))) {
    const text = readFileSync(file, 'utf8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ['tl', 'tr', 'msg'].includes(node.expression.getText(source))
      ) {
        const first = node.arguments[0];
        if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)))
          keys.set(first.text, relative(root, file));
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return keys;
}

const placeholders = (s: string) => [...new Set(s.match(/\{\d+\}/g) ?? [])].sort().join();

describe('Telugu and Hindi', () => {
  const keys = keysInSource();
  const dictionaries = { te, hi } as Record<string, Record<string, string>>;

  it('finds the interface text', () => {
    expect(keys.size).toBeGreaterThan(1500);
  });

  for (const [language, words] of Object.entries(dictionaries)) {
    it(`${language} translates every text, keeping its placeholders`, () => {
      const missing = [...keys.keys()].filter((k) => !(k in words));
      expect(missing).toEqual([]);
      const broken = [...keys.keys()].filter((k) => placeholders(k) !== placeholders(words[k]!));
      expect(broken).toEqual([]);
    });

    it(`${language} has no words for text that is gone`, () => {
      expect(Object.keys(words).filter((k) => !keys.has(k))).toEqual([]);
    });
  }
});
