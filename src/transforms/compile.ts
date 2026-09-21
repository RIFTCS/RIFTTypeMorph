import ts from "typescript";
import { RIFTError } from "../utils/errors";
import { getTransformRecords, type TransformParameterMetadata } from "./metadata";
import {
  type TransformCompilation,
  type TransformCompareOperator,
  type TransformInputIR,
  type TransformIR,
  type TransformPredicateExpression,
  type TransformValueExpression,
} from "./model";
import { getTransformOperator } from "./runtime";

type MethodOwner = Function & Record<string, unknown>;

interface CompileContext {
  inputs: Map<string, TransformInputIR>;
  locals: Map<string, TransformValueExpression>;
}

function parseMethod(fn: Function): ts.MethodDeclaration {
  const source = fn.toString();
  const file = ts.createSourceFile(
    "__rift_transform.ts",
    `class __RiftTransform { ${source} }`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  const declaration = file.statements.find(ts.isClassDeclaration);
  const method = declaration?.members.find(ts.isMethodDeclaration);
  if (!method || !method.body) {
    throw new RIFTError("Transform methods must be ordinary class methods with a readable body.");
  }
  return method;
}

function parameterName(parameter: ts.ParameterDeclaration): string {
  if (!ts.isIdentifier(parameter.name)) {
    throw new RIFTError("Transform parameters must use simple identifier names.");
  }
  return parameter.name.text;
}

function inputFromMetadata(
  index: number,
  name: string,
  metadata: TransformParameterMetadata
): TransformInputIR {
  switch (metadata.kind) {
    case "from":
    case "current":
      return { index, name, kind: metadata.kind, source: metadata.source };
    case "latest":
    case "previous":
    case "next":
      return {
        index,
        name,
        kind: metadata.kind,
        source: metadata.source,
        by: metadata.by,
        per: [...metadata.per],
      };
    case "applicable":
      return {
        index,
        name,
        kind: "applicable",
        source: metadata.source,
        to: metadata.to,
        without: [...metadata.without],
      };
    case "group":
      return {
        index,
        name,
        kind: "group",
        source: metadata.source,
        per: [...metadata.per],
      };
  }
}

function fieldExpression(node: ts.PropertyAccessExpression, context: CompileContext): TransformValueExpression {
  if (!ts.isIdentifier(node.expression)) {
    throw new RIFTError(
      `Transform field access '${node.getText()}' must start from an input parameter.`
    );
  }
  const input = node.expression.text;
  if (!context.inputs.has(input)) {
    throw new RIFTError(`'${input}' is not a decorated transform input.`);
  }
  return {
    kind: "field",
    input,
    field: node.name.text,
    optional: node.questionDotToken !== undefined,
  };
}

function aggregateSelectorField(node: ts.Expression, itemName: string): string {
  if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) {
    throw new RIFTError("Transform aggregates require a selector such as item => item.amount.");
  }
  if (node.parameters.length !== 1 || !ts.isIdentifier(node.parameters[0].name)) {
    throw new RIFTError("Transform aggregate selectors require exactly one identifier parameter.");
  }
  const declaredName = node.parameters[0].name.text;
  if (declaredName !== itemName) {
    // The caller passes the actual declared name. This branch mainly keeps the error precise.
  }
  const body = node.body;
  if (!ts.isPropertyAccessExpression(body) || !ts.isIdentifier(body.expression)) {
    throw new RIFTError("Transform aggregate selectors currently support direct field access only.");
  }
  if (body.expression.text !== declaredName) {
    throw new RIFTError("Transform aggregate selectors must read their own parameter.");
  }
  return body.name.text;
}

function calledIdentifier(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  if (ts.isParenthesizedExpression(expression)) return calledIdentifier(expression.expression);
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.CommaToken) {
    return calledIdentifier(expression.right);
  }
  return null;
}

function compileCall(node: ts.CallExpression, context: CompileContext): TransformValueExpression {
  const name = calledIdentifier(node.expression);
  if (!name) {
    throw new RIFTError(
      `Unsupported transform call '${node.expression.getText()}'. Use a registered transform operator or aggregate helper.`
    );
  }
  if (name === "sum" || name === "maximum" || name === "minimum" || name === "count") {
    if (node.arguments.length < 1 || !ts.isIdentifier(node.arguments[0])) {
      throw new RIFTError(`${name}(...) must receive a decorated @Grouped input as its first argument.`);
    }
    const inputName = node.arguments[0].text;
    const input = context.inputs.get(inputName);
    if (!input || input.kind !== "group") {
      throw new RIFTError(`${name}(${inputName}, ...) requires '${inputName}' to be an @Grouped input.`);
    }

    if (name === "count") {
      if (node.arguments.length !== 1) {
        throw new RIFTError("count(group) accepts exactly one argument.");
      }
      return { kind: "aggregate", operation: "count", input: inputName };
    }

    if (node.arguments.length !== 2 && node.arguments.length !== 3) {
      throw new RIFTError(`${name}(group, selector[, identity]) requires two or three arguments.`);
    }
    const selector = node.arguments[1];
    if (!ts.isArrowFunction(selector) && !ts.isFunctionExpression(selector)) {
      throw new RIFTError(`${name}(...) requires a selector such as item => item.amount.`);
    }
    if (selector.parameters.length !== 1 || !ts.isIdentifier(selector.parameters[0].name)) {
      throw new RIFTError(`${name}(...) selector requires exactly one identifier parameter.`);
    }
    const field = aggregateSelectorField(selector, selector.parameters[0].name.text);
    let identity: number | undefined;
    if (node.arguments[2]) {
      const identityNode = node.arguments[2];
      if (!ts.isNumericLiteral(identityNode)) {
        throw new RIFTError(`${name}(...) identity must currently be a numeric literal.`);
      }
      identity = Number(identityNode.text);
    }
    return {
      kind: "aggregate",
      operation: name === "sum" ? "plus" : name === "maximum" ? "greater of" : "lesser of",
      input: inputName,
      field,
      identity,
    };
  }

  const operator = getTransformOperator(name);
  if (operator) {
    if (node.arguments.length !== operator.arity) {
      throw new RIFTError(
        `Transform operator '${name}' expects ${operator.arity} argument(s), got ${node.arguments.length}.`
      );
    }
    return {
      kind: "operator",
      operation: operator.operation,
      args: node.arguments.map((argument) => compileValue(argument, context)),
    };
  }

  throw new RIFTError(
    `Unsupported transform function '${name}'. Register it with defineTransformOperator(...) or use a supported aggregate helper.`
  );
}

function compileValue(node: ts.Expression, context: CompileContext): TransformValueExpression {
  if (ts.isParenthesizedExpression(node)) return compileValue(node.expression, context);
  if (ts.isNumericLiteral(node)) return { kind: "literal", value: Number(node.text) };
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { kind: "literal", value: node.text };
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) return { kind: "literal", value: true };
  if (node.kind === ts.SyntaxKind.FalseKeyword) return { kind: "literal", value: false };
  if (node.kind === ts.SyntaxKind.NullKeyword) return { kind: "literal", value: null };

  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
    if (ts.isNumericLiteral(node.operand)) {
      return { kind: "literal", value: -Number(node.operand.text) };
    }
    return {
      kind: "binary",
      operator: "less",
      left: { kind: "literal", value: 0 },
      right: compileValue(node.operand, context),
    };
  }

  if (ts.isIdentifier(node)) {
    const local = context.locals.get(node.text);
    if (local) return local;
    throw new RIFTError(
      `Identifier '${node.text}' is not a value expression. Read a field (for example '${node.text}.amount') instead.`
    );
  }

  if (ts.isPropertyAccessExpression(node)) return fieldExpression(node, context);
  if (ts.isCallExpression(node)) return compileCall(node, context);

  if (ts.isBinaryExpression(node)) {
    if (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
      const left = compileValue(node.left, context);
      const right = compileValue(node.right, context);
      return {
        kind: "coalesce",
        values: [
          ...(left.kind === "coalesce" ? left.values : [left]),
          ...(right.kind === "coalesce" ? right.values : [right]),
        ],
      };
    }

    const operator =
      node.operatorToken.kind === ts.SyntaxKind.PlusToken
        ? "plus"
        : node.operatorToken.kind === ts.SyntaxKind.MinusToken
          ? "less"
          : node.operatorToken.kind === ts.SyntaxKind.AsteriskToken
            ? "times"
            : node.operatorToken.kind === ts.SyntaxKind.SlashToken
              ? "over"
              : null;
    if (operator) {
      return {
        kind: "binary",
        operator,
        left: compileValue(node.left, context),
        right: compileValue(node.right, context),
      };
    }
  }

  throw new RIFTError(`Unsupported transform value expression '${node.getText()}'.`);
}

function isUndefined(node: ts.Expression): boolean {
  return ts.isIdentifier(node) && node.text === "undefined";
}

function comparisonOperator(kind: ts.SyntaxKind): TransformCompareOperator | null {
  switch (kind) {
    case ts.SyntaxKind.LessThanToken:
      return "<";
    case ts.SyntaxKind.LessThanEqualsToken:
      return "<=";
    case ts.SyntaxKind.GreaterThanToken:
      return ">";
    case ts.SyntaxKind.GreaterThanEqualsToken:
      return ">=";
    case ts.SyntaxKind.EqualsEqualsToken:
    case ts.SyntaxKind.EqualsEqualsEqualsToken:
      return "=";
    case ts.SyntaxKind.ExclamationEqualsToken:
    case ts.SyntaxKind.ExclamationEqualsEqualsToken:
      return "!=";
    default:
      return null;
  }
}

function compilePredicate(node: ts.Expression, context: CompileContext): TransformPredicateExpression {
  if (ts.isParenthesizedExpression(node)) return compilePredicate(node.expression, context);
  if (ts.isIdentifier(node) && context.inputs.has(node.text)) {
    return { kind: "exists", input: node.text };
  }
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) {
    return { kind: "not", predicate: compilePredicate(node.operand, context) };
  }
  if (ts.isBinaryExpression(node)) {
    if (
      node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
      node.operatorToken.kind === ts.SyntaxKind.BarBarToken
    ) {
      const kind = node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ? "and" : "or";
      const left = compilePredicate(node.left, context);
      const right = compilePredicate(node.right, context);
      return {
        kind,
        parts: [
          ...(left.kind === kind ? left.parts : [left]),
          ...(right.kind === kind ? right.parts : [right]),
        ],
      };
    }

    const operator = comparisonOperator(node.operatorToken.kind);
    if (operator) {
      if (ts.isIdentifier(node.left) && context.inputs.has(node.left.text) && isUndefined(node.right)) {
        const exists: TransformPredicateExpression = { kind: "exists", input: node.left.text };
        return operator === "=" ? { kind: "not", predicate: exists } : exists;
      }
      if (ts.isIdentifier(node.right) && context.inputs.has(node.right.text) && isUndefined(node.left)) {
        const exists: TransformPredicateExpression = { kind: "exists", input: node.right.text };
        return operator === "=" ? { kind: "not", predicate: exists } : exists;
      }
      return {
        kind: "compare",
        operator,
        left: compileValue(node.left, context),
        right: compileValue(node.right, context),
      };
    }
  }

  throw new RIFTError(`Unsupported transform guard '${node.getText()}'.`);
}

function negate(predicate: TransformPredicateExpression): TransformPredicateExpression {
  if (predicate.kind === "not") return predicate.predicate;
  if (predicate.kind === "and") {
    return { kind: "or", parts: predicate.parts.map((part) => negate(part)) };
  }
  if (predicate.kind === "or") {
    return { kind: "and", parts: predicate.parts.map((part) => negate(part)) };
  }
  if (predicate.kind === "compare") {
    const inverted: Record<TransformCompareOperator, TransformCompareOperator> = {
      "<": ">=",
      "<=": ">",
      ">": "<=",
      ">=": "<",
      "=": "!=",
      "!=": "=",
    };
    return { ...predicate, operator: inverted[predicate.operator] };
  }
  return { kind: "not", predicate };
}

function isEmptyReturn(statement: ts.Statement): boolean {
  if (ts.isReturnStatement(statement)) return statement.expression === undefined;
  if (ts.isBlock(statement) && statement.statements.length === 1) {
    const only = statement.statements[0];
    return ts.isReturnStatement(only) && only.expression === undefined;
  }
  return false;
}

function compileReturnObject(
  expression: ts.Expression,
  context: CompileContext
): { field: string; expression: TransformValueExpression }[] {
  if (!ts.isObjectLiteralExpression(expression)) {
    throw new RIFTError("Executable transforms must return an object literal (or return nothing to skip a figure).");
  }

  return expression.properties.map((property) => {
    if (!ts.isPropertyAssignment(property)) {
      throw new RIFTError("Transform return objects currently support explicit property assignments only.");
    }
    const name = property.name;
    const field = ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;
    if (!field) throw new RIFTError("Transform output field names must be identifiers or string literals.");
    return { field, expression: compileValue(property.initializer, context) };
  });
}

function compileOne(owner: MethodOwner, propertyKey: string | symbol, ordinal: number): TransformIR {
  const record = getTransformRecords(owner).get(propertyKey);
  if (!record?.method) {
    throw new RIFTError(`Transform metadata is missing for ${String(propertyKey)}.`);
  }
  const method = owner[propertyKey as keyof MethodOwner];
  if (typeof method !== "function") {
    throw new RIFTError(`@Transform can only decorate static methods; ${String(propertyKey)} is not callable.`);
  }

  const declaration = parseMethod(method);
  const inputs: TransformInputIR[] = [];
  const inputMap = new Map<string, TransformInputIR>();

  declaration.parameters.forEach((parameter, index) => {
    const name = parameterName(parameter);
    const metadata = record.parameters.get(index);
    if (!metadata) {
      throw new RIFTError(
        `${owner.name}.${String(propertyKey)} parameter '${name}' needs an input decorator such as @From, @Applicable, @Previous, or @Grouped.`
      );
    }
    const input = inputFromMetadata(index, name, metadata);
    inputs.push(input);
    inputMap.set(name, input);
  });

  const principalIndex = record.method.principal ?? 0;
  const principal = inputs.find((input) => input.index === principalIndex);
  if (!principal) {
    throw new RIFTError(
      `${owner.name}.${String(propertyKey)} principal parameter index ${principalIndex} is not a decorated input.`
    );
  }

  const context: CompileContext = { inputs: inputMap, locals: new Map() };
  const guards: TransformPredicateExpression[] = [];
  let output: { field: string; expression: TransformValueExpression }[] | undefined;

  for (const statement of declaration.body!.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
          throw new RIFTError("Transform local variables require a simple name and initializer.");
        }
        context.locals.set(declaration.name.text, compileValue(declaration.initializer, context));
      }
      continue;
    }

    if (ts.isIfStatement(statement)) {
      if (statement.elseStatement || !isEmptyReturn(statement.thenStatement)) {
        throw new RIFTError(
          "Transform if-statements currently support guard-style early returns only: if (condition) return;"
        );
      }
      guards.push(negate(compilePredicate(statement.expression, context)));
      continue;
    }

    if (ts.isReturnStatement(statement)) {
      if (!statement.expression) continue;
      output = compileReturnObject(statement.expression, context);
      continue;
    }

    throw new RIFTError(
      `Unsupported statement in ${owner.name}.${String(propertyKey)}: '${statement.getText()}'. ` +
        "Use const bindings, guard-style early returns, and one object-literal return."
    );
  }

  if (!output) {
    throw new RIFTError(`${owner.name}.${String(propertyKey)} has no object-literal return.`);
  }

  return {
    owner,
    methodName: String(propertyKey),
    name: record.method.name,
    label: record.method.label ?? `T${ordinal}`,
    seed: record.method.seed,
    identity: [...(record.method.identity ?? [])],
    inputs,
    principalInput: principal.name,
    guards,
    output,
  };
}

export function compileTransformClass(owner: Function): TransformCompilation {
  const records = getTransformRecords(owner);
  const transforms: TransformIR[] = [];
  let ordinal = 1;
  for (const [propertyKey, record] of records) {
    if (!record.method) continue;
    transforms.push(compileOne(owner as MethodOwner, propertyKey, ordinal));
    ordinal += 1;
  }
  return { transforms };
}

export function compileTransformClasses(owners: readonly Function[]): TransformCompilation {
  return {
    transforms: owners.flatMap((owner) => compileTransformClass(owner).transforms),
  };
}
