/**
 * Error Handling - Simplified
 * 
 * Consolidated error system with only essential error types and utilities.
 * Reduced from 5 error classes to 2, and from 19 error codes to 6.
 */

/**
 * Simplified error codes for programmatic error handling
 */
export const ErrorCode = {
  // API Errors (network, timeout, server - all combined)
  API_ERROR: 1000,
  
  // Game Errors (invalid move, FEN, state - all combined)
  GAME_ERROR: 2000,
  
  // Storage Errors (save, load, quota - all combined)
  STORAGE_ERROR: 3000,
  
  // Validation Errors (invalid input, format - all combined)
  VALIDATION_ERROR: 4000,
  
  // Unknown/Generic Errors
  UNKNOWN_ERROR: 9999,
} as const;

export type ErrorCode = typeof ErrorCode[keyof typeof ErrorCode];

/**
 * Base application error class
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly timestamp: number;
  readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.timestamp = Date.now();
    this.context = context;

    // Maintains proper stack trace (V8 only)
    const errorConstructor = Error as unknown as { 
      captureStackTrace?: (target: object, constructor: new (...args: unknown[]) => unknown) => void 
    };
    if (typeof errorConstructor.captureStackTrace === 'function') {
      errorConstructor.captureStackTrace(this, this.constructor as new (...args: unknown[]) => unknown);
    }
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
    statusCode?: number,
    endpoint?: string,
    context?: Record<string, unknown>
  ) {
    super(message, ErrorCode.API_ERROR, context);
    this.statusCode = statusCode;
    this.endpoint = endpoint;
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
 * Get a user-friendly error message from an error
 */
export function getUserFriendlyMessage(error: unknown): string {
  if (isAppError(error)) {
    return error.message || 'An unexpected error occurred. Please try again.';
  }
  
  if (error instanceof Error) {
    return error.message || 'An unexpected error occurred. Please try again.';
  }
  
  if (typeof error === 'string') {
    return error || 'An unexpected error occurred. Please try again.';
  }
  
  return 'An unexpected error occurred. Please try again.';
}

/**
 * Log an error with context information
 */
export function logError(error: unknown, context?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const prefix = '[ErrorHandler]';
  
  if (isAppError(error)) {
    console.error(prefix, timestamp, error.name, {
      message: error.message,
      code: error.code,
      context: { ...error.context, ...context },
      stack: error.stack,
    });
  } else if (error instanceof Error) {
    console.error(prefix, timestamp, error.name, {
      message: error.message,
      context,
      stack: error.stack,
    });
  } else {
    console.error(prefix, timestamp, 'Unknown error:', error, context);
  }
}

/**
 * Factory function to create an APIError from fetch response
 */
export function createAPIErrorFromResponse(
  response: Response,
  endpoint: string,
  message?: string
): APIError {
  const statusCode = response.status;
  const errorMessage = message || `API request failed with status ${statusCode}`;
  return new APIError(errorMessage, statusCode, endpoint);
}

/**
 * Factory function to create a network error
 */
export function createNetworkError(endpoint: string, originalError?: unknown): APIError {
  return new APIError(
    'Network connection failed',
    undefined,
    endpoint,
    { originalError: originalError instanceof Error ? originalError.message : String(originalError) }
  );
}

/**
 * Factory function to create a game error for invalid moves
 */
export function createInvalidMoveError(move: string, fen?: string): AppError {
  return new AppError(
    `Invalid move: ${move}`,
    ErrorCode.GAME_ERROR,
    { move, fen }
  );
}

/**
 * Factory function to create a game error for invalid FEN
 */
export function createInvalidFenError(fen: string, reason?: string): AppError {
  return new AppError(
    reason ? `Invalid FEN: ${reason}` : 'Invalid FEN string',
    ErrorCode.GAME_ERROR,
    { fen, reason }
  );
}

/**
 * Factory function to create a storage error for quota exceeded
 */
export function createQuotaExceededError(operation: string): AppError {
  return new AppError(
    'Storage quota exceeded',
    ErrorCode.STORAGE_ERROR,
    { operation }
  );
}

/**
 * Factory function to create a storage error for unavailable storage
 */
export function createStorageUnavailableError(): AppError {
  return new AppError(
    'Local storage is not available',
    ErrorCode.STORAGE_ERROR
  );
}

/**
 * Factory function to create a validation error
 */
export function createValidationError(
  message: string,
  field?: string,
  value?: unknown
): AppError {
  return new AppError(
    message,
    ErrorCode.VALIDATION_ERROR,
    { field, value }
  );
}
