import { z } from 'zod';

export type SchemaIssue = {
  readonly path: ReadonlyArray<string | number>;
  readonly message: string;
  readonly code: string;
};

export class SchemaValidationError extends Error {
  readonly contextLabel: string;
  readonly issues: ReadonlyArray<SchemaIssue>;

  constructor(contextLabel: string, issues: ReadonlyArray<SchemaIssue>, cause: z.ZodError) {
    super(`${contextLabel}:\n${z.prettifyError(cause)}`, { cause });
    this.name = 'SchemaValidationError';
    this.contextLabel = contextLabel;
    this.issues = issues;
  }
}
