import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as publicApi from "../src";

/**
 * Unlike copy/pasted tests, these execute the actual fenced TypeScript examples
 * in guidance/updateWith.md. Adding a snippet without a matching test ID fails
 * the documentation contract, and changing a snippet changes the executed code.
 */
const guide = fs.readFileSync(
  path.join(process.cwd(), "guidance", "updateWith.md"),
  "utf8"
);

const expectedLogs: Record<string, unknown[][]> = {
  "basic": [[true], [true], [0.4], [0.4]],
  "react-setter": [[true], [0.4]],
  "shared-handles": [[true], [2, 2, 2], [3, 3]],
  "nested-references": [[true], [true], [5]],
  "class-methods": [[3], [1]],
  "serialization": [[{progress: 50}], [true], [50]],
  "clone-contrast": [[20], [20], [10]],
  "error-handling": [[0]],
  "empty-update": [[true], [25]]
};

const markdownExamples = Array.from(guide.matchAll(
  /<!--\s*update-with-test:\s*([a-z0-9-]+)\s*-->\s*```ts\n([\s\S]*?)```/g
)).map((match) => ({id: match[1], source: match[2]}));

describe("guidance/updateWith.md: executable documentation contract", () => {
  it("exports updateWith at the same root the guide imports", () => {
    expect(publicApi.updateWith).toBeTypeOf("function");
  });

  it("tests every TypeScript fenced example exactly once", () => {
    const ids = markdownExamples.map(({id}) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(Object.keys(expectedLogs).sort());
    expect(Array.from(guide.matchAll(/```ts\n/g))).toHaveLength(ids.length);
    expect(Array.from(guide.matchAll(/<!--\s*update-with-test:/g))).toHaveLength(ids.length);
  });

  for (const {id, source} of markdownExamples) {
    it(`[GUIDE:${id}] runs the documented source and gets the documented result`, () => {
      const compiled = ts.transpileModule(source, {
        fileName: `${id}.ts`,
        compilerOptions: {
          target: ts.ScriptTarget.ES2020,
          module: ts.ModuleKind.CommonJS,
          experimentalDecorators: true,
          emitDecoratorMetadata: true
        },
        reportDiagnostics: true
      });
      const errors = (compiled.diagnostics ?? []).filter(
        diagnostic => diagnostic.category === ts.DiagnosticCategory.Error
      );
      expect(errors).toEqual([]);

      const logs: unknown[][] = [];
      const consoleStub = {log: (...args: unknown[]) => logs.push(args)};
      const requireStub = (specifier: string) => {
        if (specifier !== "@riftcs/rifttypemorph") {
          throw new Error(`Undocumented dependency in example ${id}: ${specifier}`);
        }
        return publicApi;
      };
      const moduleStub = {exports: {}};
      const execute = new Function(
        "require", "module", "exports", "console", compiled.outputText
      );
      execute(requireStub, moduleStub, moduleStub.exports, consoleStub);
      expect(logs).toEqual(expectedLogs[id]);
    });
  }
});
