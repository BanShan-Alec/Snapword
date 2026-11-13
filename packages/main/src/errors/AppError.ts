export class AppError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
