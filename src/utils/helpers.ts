import { RIFTError } from "./errors";

/**
 * Ensures an array has exactly one element.
 * Throws descriptive errors if the result count is unexpected.
 */
export function single<T>(results: T[], message: string): T {
  if (results.length > 1) {
    const error = new RIFTError(
      `Expected a single record for "${message}", but found ${results.length}.`,
      "single()"
    );
    console.error(error.message, results);
    throw error;
  } else if (results.length === 0) {
    const error = new RIFTError(
      `Expected a single record for "${message}", but found none.`,
      "single()"
    );
    console.error(error.message);
    throw error;
  }

  return results[0];
}

/**
 * Ensures an array has at most one element, returning null if none found.
 */
export function singleOrNull<T>(results: T[], message: string): T | null {
  if (results.length > 1) {
    const error = new RIFTError(
      `Expected zero or one record for "${message}", but found ${results.length}.`,
      "singleOrNull()"
    );
    console.error(error.message, results);
    throw error;
  } else if (results.length === 0) {
    console.warn(`[singleOrNull] No record found for "${message}".`);
    return null;
  }

  return results[0];
}
