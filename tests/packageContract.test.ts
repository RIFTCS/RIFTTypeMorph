import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("npm package contract", () => {
  const root = process.cwd();
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const tsconfigText = fs.readFileSync(path.join(root, "tsconfig.json"), "utf8");
  const license = fs.readFileSync(path.join(root, "LICENSE"), "utf8");

  it("is prepared as a public RIFT-scoped package", () => {
    expect(packageJson.name).toBe("@riftcs/rifttypemorph");
    expect(packageJson.publishConfig).toEqual({ access: "public" });
    expect(packageJson.main).toBe("./dist/index.js");
    expect(packageJson.types).toBe("./dist/index.d.ts");
  });

  it("publishes only the built library and package documentation", () => {
    expect(packageJson.files).toEqual(["dist", "README.md", "LICENSE"]);
    expect(packageJson.scripts.prepare).toBeUndefined();
    expect(packageJson.scripts.prepack).toContain("npm run build");
    expect(packageJson.scripts.prepack).toContain("npm test");
    expect(packageJson.scripts.prepack).toContain("npm run verify:dist");
  });

  it("uses the custom license metadata and ships the threshold terms", () => {
    expect(packageJson.license).toBe("SEE LICENSE IN LICENSE");
    expect(license).toContain("RIFT Small Commercial Source License 1.0");
    expect(license).toContain("AUD 100,000");
    expect(license).toContain("separate written commercial license");
  });

  it("embeds TypeScript source into emitted source maps", () => {
    expect(tsconfigText).toMatch(/"sourceMap"\s*:\s*true/);
    expect(tsconfigText).toMatch(/"inlineSources"\s*:\s*true/);
  });
});
