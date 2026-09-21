import { describe, expect, it } from "vitest";
import {
  adapterExecutableExample,
  defaultHierarchyExecutableExample,
  groupedReductionExecutableExample,
  laggedReadExecutableExample,
  lifecycleExecutableExample,
  maximumReductionExecutableExample,
  stateChainExecutableExample,
  validationExecutableExample,
} from "../examples/executable_transforms";

describe("executable TypeMorph transforms", () => {
  it("executes default/fallback domain logic natively and lowers nullish coalescing", () => {
    const { hill, dale, generated } = defaultHierarchyExecutableExample();
    expect(hill).toEqual({ amount: 700 });
    expect(dale).toEqual({ amount: 200 });
    expect(generated.markdown).toContain(
      "amount: amount times (amount of named set price then amount of (named set price and without shop))"
    );
  });

  it("lowers previous/as-of reads rather than special-casing prices", () => {
    const { native, generated } = laggedReadExecutableExample();
    expect(native).toEqual({ amount: 2 });
    expect(generated.markdown).toContain(
      "newest by when of (named set count and when < their when) per shop"
    );
    expect(generated.markdown).toContain("| over |");
  });

  it("lowers lifecycle existence guards from ordinary early-return control flow", () => {
    const { nativeOpen, nativeClosed, generated } = lifecycleExecutableExample();
    expect(nativeOpen).toEqual({ amount: 50 });
    expect(nativeClosed).toBeUndefined();
    expect(generated.markdown).toContain("with newest by when of (named open shop and when <= their when) per shop");
    expect(generated.markdown).toContain("not with newest by when of (named close shop and when <= their when) per shop");
  });

  it("lowers native array reductions to Grain grouping", () => {
    const { native, generated } = groupedReductionExecutableExample();
    expect(native).toEqual({ amount: 25 });
    expect(generated.markdown).toContain("| T1 | named log invoice | group | per: day; amount: plus over amount |");
    expect(generated.markdown).toContain("identity | named log invoice on day");
  });

  it("lowers custom fold reductions with an explicit executable identity", () => {
    const { native, generated } = maximumReductionExecutableExample();
    expect(native).toEqual({ amount: 9 });
    expect(generated.markdown).toContain(
      "greater of | named set reading on amount with named set reading on amount -> named peak"
    );
    expect(generated.markdown).toContain("foldable, identity 0");
    expect(generated.markdown).toContain("amount: greater of over amount");
  });

  it("keeps custom adapters executable while declaring the Grain operator", () => {
    const { native, generated } = adapterExecutableExample();
    expect(native).toEqual({ amount: 12.34, party: "Bank" });
    expect(generated.markdown).toContain("| cents to dollars | named set advance on principal -> named loan |");
    expect(generated.markdown).toContain("amount: cents to dollars of principal; party: provider");
  });

  it("lowers recursive ordered state chains with next-axis identity and coalesced optional inputs", () => {
    const { native, generated } = stateChainExecutableExample();
    expect(native).toEqual({ when: 1, amount: 30 });
    expect(generated.markdown).toContain("tank | named set tank or made by work out from named tank");
    expect(generated.markdown).toContain("when: next by when of named set day");
    expect(generated.markdown).toContain("plus | named tank on amount with number -> named tank");
  });

  it("lowers validation predicates and infers scalar comparison forms", () => {
    const { nativeApproved, nativeRejected, generated } = validationExecutableExample();
    expect(nativeApproved).toEqual({ amount: 50 });
    expect(nativeRejected).toBeUndefined();
    expect(generated.markdown).toContain("amount <= limit of named set credit limit");
    expect(generated.markdown).toContain("compare | named log invoice on amount with number");
    expect(generated.markdown).toContain("compare | named set credit limit on limit with number");
  });
});
