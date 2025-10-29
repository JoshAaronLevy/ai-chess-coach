/**
 * Error Types and Classes
 * 
 * Provides standardized error handling across the application with:
 * - Custom error classes extending Error
 * - Error codes for programmatic error handling
 * - Consistent error formatting and metadata
 */

/**
 * Error codes for programmatic error handling
 */
export const ErrorCode = {
  // API Errors (1xxx)
  API_NETWORK_ERROR: 1001,
  API_TIMEOUT: 1002,
  API_INVALID_RESPONSE: 1003,
  API_SERVER_ERROR: 1004,
  API_RATE_LIMIT: 1005,
  API_UNAUTHORIZED: 1006,
  
  // Game Errors (2xxx)
  GAME_INVALID_MOVE: 2001,
  GAME_INVALID_FEN: 2002,
  GAME_INVALID_STATE: 2003,
  GAME_ALREADY_OVER: 2004,
  
  // Persistence Errors (3xxx)
  PERSISTENCE_SAVE_FAILED: 3001,
  PERSISTENCE_LOAD_FAILED: 3002,
  PERSISTENCE_NOT_FOUND: 3003,
  PERSISTENCE_QUOTA_EXCEEDED: 3004,
  PERSISTENCE_CORRUPTED_DATA: 3005,
  PERSISTENCE_STORAGE_UNAVAILABLE: 3006,
  
  // Validation Errors (4xxx)
  VALIDATION_INVALID_INPUT: 4001,
  VALIDATION_MISSING_REQUIRED: 4002,
  VALIDATION_FORMAT_ERROR: 4003,
  VALIDATION_CONSTRAINT_VIOLATION: 4004,
  
  // Unknown/Generic Errors (9xxx)
  UNKNOWN_ERROR: 9999,
} as const;

export type ErrorCode = typeof ErrorCode[keyof typeof ErrorCode];

/**
 * Base application error class
 * All custom errors should extend this class
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly isOperational: boolean;
  readonly timestamp: number;
  readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
    isOperational = true,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.isOperational = isOperational;
    this.timestamp = Date.now();
    this.context = context;

    // Maintains proper stack trace for where error was thrown (V8 only)
    const errorConstructor = Error as unknown as { 
      captureStackTrace?: (target: object, constructor: new (...args: unknown[]) => unknown) => void 
    };
    if (typeof errorConstructor.captureStackTrace === 'function') {
      errorConstructor.captureStackTrace(this, this.constructor as new (...args: unknown[]) => unknown);
    }
  }

  /**
   * Convert error to JSON for logging or API responses
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * API-related errors (network, timeout, server errors)
 */
export class APIError extends AppError {
  readonly statusCode?: number;
  readonly endpoint?: string;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.API_SERVER_ERROR,
    statusCode?: number,
    endpoint?: string,
    context?: Record<string, unknown>
  ) {
    super(message, code, true, context);
    this.statusCode = statusCode;
    this.endpoint = endpoint;
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      statusCode: this.statusCode,
      endpoint: this.endpoint,
    };
  }
}

/**
 * Chess game logic errors (invalid moves, FEN, game state)
 */
export class GameError extends AppError {
  readonly fen?: string;
  readonly move?: string;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.GAME_INVALID_STATE,
    context?: Record<string, unknown>
  ) {
    super(message, code, true, context);
    this.fen = context?.fen as string | undefined;
    this.move = context?.move as string | undefined;
  }
}

/**
 * Persistence/storage errors (save, load, quota)
 */
export class PersistenceError extends AppError {
  readonly storageKey?: string;
  readonly operation?: 'save' | 'load' | 'delete' | 'export' | 'import';

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.PERSISTENCE_SAVE_FAILED,
    operation?: 'save' | 'load' | 'delete' | 'export' | 'import',
    context?: Record<string, unknown>
  ) {
    super(message, code, true, context);
    this.storageKey = context?.storageKey as string | undefined;
    this.operation = operation;
  }
}

/**
 * Validation errors (invalid input, format, constraints)
 */
export class ValidationError extends AppError {
  readonly field?: string;
  readonly value?: unknown;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.VALIDATION_INVALID_INPUT,
    field?: string,
    value?: unknown,
    context?: Record<string, unknown>
  ) {
    super(message, code, true, context);
    this.field = field;
    this.value = value;
  }
}

/**
 * Type guard to check if an error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Type guard to check if an error is an APIError
 */
export function isAPIError(error: unknown): error is APIError {
  return error instanceof APIError;
}

/**
 * Type guard to check if an error is a GameError
 */
export function isGameError(error: unknown): error is GameError {
  return error instanceof GameError;
}

/**
 * Type guard to check if an error is a PersistenceError
 */
export function isPersistenceError(error: unknown): error is PersistenceError {
  return error instanceof PersistenceError;
}

/**
 * Type guard to check if an error is a ValidationError
 */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}
