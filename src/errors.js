export class UsageError extends Error {
  constructor() {
    super('usage');
    this.name = 'UsageError';
  }
}

export class CliError extends Error {}
