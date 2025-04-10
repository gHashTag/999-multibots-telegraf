export interface ApiErrorResponse {
  status: number;
  message: string;
  details?: unknown;
}

export class BaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ApiError extends BaseError {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export class ValidationError extends BaseError {
  constructor(message: string) {
    super(message);
  }
}

export class InsufficientBalanceError extends BaseError {
  constructor(
    public required: number,
    public available: number
  ) {
    super(`Insufficient balance: required ${required}, available ${available}`);
  }
}

export class TimeoutError extends BaseError {
  constructor(message: string) {
    super(message);
  }
}

export type ErrorType = 
  | 'API_ERROR' 
  | 'VALIDATION_ERROR' 
  | 'INSUFFICIENT_BALANCE' 
  | 'TIMEOUT_ERROR' 
  | 'UNKNOWN_ERROR'; 