/** An error whose message is meant for the person using the app (Swedish, no internals). */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}
