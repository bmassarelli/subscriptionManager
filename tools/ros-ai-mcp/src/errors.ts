export class RosError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = new.target.name;
  }
}

export class RosAuthError extends RosError {}

export class RosNotFoundError extends RosError {}

export class RosServerError extends RosError {
  constructor(message: string, public readonly status: number, cause?: unknown) {
    super(message, cause);
  }
}

export class RosTimeoutError extends RosError {}

export class RosInvalidRequestError extends RosError {}

export class RosUnexpectedResponseError extends RosError {
  constructor(message: string, public readonly body: string, cause?: unknown) {
    super(message, cause);
  }
}
