import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/* A spec that only makes sense against `vite preview` asks `isPreviewRun` in
   `e2e/support/preview-mode.ts`, the function `playwright.config.ts` uses to pick the server. Reading
   the answer off the port instead skips the whole spec whenever `PORT` moves the server, which is how
   several lanes share one machine, and a skipped spec reports no failure.

   The specs are read as syntax trees: no browser, nothing to launch, and a comment that names the
   switch or a port while explaining the rule is not code. */

const E2E = path.join(process.cwd(), 'e2e');
const PREVIEW_ONLY_SPECS = ['security-headers.spec.ts', 'sw-lifecycle.spec.ts'];
const MIN_REASON_LENGTH = 12;

const specsUnder = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            return specsUnder(file);
        }
        return entry.name.endsWith('.spec.ts') ? [file] : [];
    });

const nodesOf = (root) => {
    const found = [];
    const visit = (node) => {
        found.push(node);
        ts.forEachChild(node, visit);
    };
    visit(root);
    return found;
};

const specs = specsUnder(E2E).map((file) => ({
    name: path.relative(E2E, file),
    nodes: nodesOf(
        ts.createSourceFile(
            file,
            readFileSync(file, 'utf8'),
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TS
        )
    )
}));

const specNamed = (name) => specs.find((spec) => spec.name === name)?.nodes ?? [];

const callsTo = (nodes, name) =>
    nodes.filter(
        (node) =>
            ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === name
    );

// `test.<member>(...)`: how Playwright spells a switch that turns a test off.
const memberCalls = (nodes, receiver, member) =>
    nodes.filter(
        (node) =>
            ts.isCallExpression(node) &&
            ts.isPropertyAccessExpression(node.expression) &&
            node.expression.expression.getText() === receiver &&
            node.expression.name.text === member
    );

// `!isPreviewRun(process.env)`
const isNegatedPreviewQuestion = (node) =>
    node !== undefined &&
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.ExclamationToken &&
    ts.isCallExpression(node.operand) &&
    node.operand.expression.getText() === 'isPreviewRun' &&
    node.operand.arguments.length === 1 &&
    node.operand.arguments[0].getText() === 'process.env';

const textOfLiterals = (nodes) =>
    nodes
        .filter(
            (node) =>
                ts.isStringLiteralLike(node) ||
                ts.isTemplateHead(node) ||
                ts.isTemplateMiddle(node) ||
                ts.isTemplateTail(node)
        )
        .map((node) => node.text);

describe('preview-only specs', () => {
    it('reads the specs it guards', () => {
        const names = specs.map(({ name }) => name);

        for (const spec of PREVIEW_ONLY_SPECS) {
            expect(names, `${spec} is not under e2e/`).toContain(spec);
        }
    });

    it('asks isPreviewRun, not the port, whether the preview build is running', () => {
        for (const spec of PREVIEW_ONLY_SPECS) {
            expect(
                callsTo(specNamed(spec), 'isPreviewRun'),
                `${spec} does not call isPreviewRun`
            ).not.toHaveLength(0);
        }
    });

    it('skips with a reason when the dev server is running', () => {
        for (const spec of PREVIEW_ONLY_SPECS) {
            const [call, ...others] = memberCalls(specNamed(spec), 'test', 'skip');
            const [condition, reason] = call?.arguments ?? [];

            expect(call, `${spec} does not skip when the dev server runs`).toBeDefined();
            expect(
                others,
                `${spec} switches itself off more than once: ask isPreviewRun once`
            ).toHaveLength(0);
            expect(
                isNegatedPreviewQuestion(condition),
                `${spec} does not skip on !isPreviewRun(process.env)`
            ).toBe(true);
            expect(
                reason !== undefined &&
                    ts.isStringLiteralLike(reason) &&
                    reason.text.length >= MIN_REASON_LENGTH,
                `${spec} skips without saying why`
            ).toBe(true);
        }
    });

    it('has no spec that reads a port number', () => {
        const withPort = specs
            .filter(({ nodes }) => textOfLiterals(nodes).some((text) => /:\d{4,5}\b/.test(text)))
            .map(({ name }) => name);

        expect(withPort).toEqual([]);
    });

    it('has no spec that rebuilds the switch from the environment', () => {
        const rebuilt = specs
            .filter(({ nodes }) =>
                nodes.some(
                    (node) =>
                        (ts.isPropertyAccessExpression(node) &&
                            /^process\.env\.(?:CI|PLAYWRIGHT_USE_PREVIEW)$/.test(node.getText())) ||
                        (ts.isStringLiteralLike(node) && node.text === 'PLAYWRIGHT_USE_PREVIEW')
                )
            )
            .map(({ name }) => name);

        expect(rebuilt).toEqual([]);
    });
});
