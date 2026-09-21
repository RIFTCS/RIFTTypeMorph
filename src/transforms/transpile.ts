import type { Constructor } from "../core/TSField";
import { grainRules, type GrainRuleSet } from "../grain/dsl";
import type { GrainTranspileResult } from "../grain/model";
import { lowerTransformsToGrainRules } from "../grain/transformLowering";
import { transpileEntitiesToGrain } from "../grain/transpile";
import { compileTransformClasses } from "./compile";
import type { TransformCompilation } from "./model";

export interface ExecutableTransformTranspileResult extends GrainTranspileResult {
  transforms: TransformCompilation;
}

export function mergeGrainRuleSets(...sets: Array<GrainRuleSet | undefined>): GrainRuleSet {
  const present = sets.filter((set): set is GrainRuleSet => set !== undefined);
  return grainRules({
    fieldRows: present.flatMap((set) => set.fieldRows),
    permissions: present.flatMap((set) => set.permissions),
    narrowing: present.flatMap((set) => set.narrowing),
    rows: present.flatMap((set) => set.rows),
    supplied: present.flatMap((set) => set.supplied),
    expected: present.flatMap((set) => set.expected),
  });
}

export function transpileExecutableTransformsToGrain(
  entities: readonly Constructor[],
  transformOwners: readonly Function[],
  options: {
    title?: string;
    rules?: GrainRuleSet;
    inferCurrentWords?: boolean;
  } = {}
): ExecutableTransformTranspileResult {
  const transforms = compileTransformClasses(transformOwners);
  const transformRules = lowerTransformsToGrainRules(entities, transforms);
  const result = transpileEntitiesToGrain(entities, {
    title: options.title,
    rules: mergeGrainRuleSets(transformRules, options.rules),
    inferCurrentWords: options.inferCurrentWords,
  });
  return { ...result, transforms };
}
