export class RIFTError extends Error {
  public context: string;

  constructor(message: string, context: string = "root") {
    super(`[${context}] ${message}`);
    this.name = "RIFTError";
    this.context = context;
  }
}

export function missingRequired(field: string, context: string): never {
  throw new RIFTError(`Missing required property: ${field}`, context);
}

export function invalidType(expected: string, actual: string, context: string): never {
  throw new RIFTError(`Invalid type: expected ${expected}, got ${actual}`, context);
}
