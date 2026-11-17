export class RuleError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'RuleError';
    this.status = status;
  }
}
