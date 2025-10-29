/**
 * Error Handling Utilities
 * 
 * Provides utilities for:
 * - Converting errors to user-friendly messages
 * - Logging errors with context
 * - Determining if errors are retryable
 * - Creating standardized error instances
 */

import { 
  AppError, 
  APIError, 
  GameError, 
  PersistenceError, 
  ValidationError,
  ErrorCode,
  isAppError,
  isAPIError,
  isPersistenceError
} from '../types/errors';

/**
 * Map error codes to user-friendly messages
 */
const USER_FRIENDLY_MESSAGES: Record<number, string> = {
  // API Errors
  [ErrorCode.API_NETWORK_ERROR]: 'Network connection failed. Please check your internet connection.',
  [ErrorCode.API_TIMEOUT]: 'The request took too long. Please try again.',
  [ErrorCode.API_INVALID_RESPONSE]: 'Received an invalid response from the server.',
  [ErrorCode.API_SERVER_ERROR]: 'The server encountered an error. Please try again later.',
  [ErrorCode.API_RATE_LIMIT]: 'Too many requests. Please wait a moment and try again.',
  [ErrorCode.API_UNAUTHORIZED]: 'Authentication failed. Please refresh the page.',
  
  // Game Errors
  [ErrorCode.GAME_INVALID_MOVE]: 'That move is not legal in this position.',
  [ErrorCode.GAME_INVALID_FEN]: 'The board position is invalid.',
  [ErrorCode.GAME_INVALID_STATE]: 'The game is in an invalid state.',
  [ErrorCode.GAME_ALREADY_OVER]: 'The game has already ended.',
  
  // Persistence Errors
  [ErrorCode.PERSISTENCE_SAVE_FAILED]: 'Failed to save the game. Please try again.',
  [ErrorCode.PERSISTENCE_LOAD_FAILED]: 'Failed to load the saved game.',
  [ErrorCode.PERSISTENCE_NOT_FOUND]: 'No saved game found.',
  [ErrorCode.PERSISTENCE_QUOTA_EXCEEDED]: 'Storage is full. Please delete old games to free up space.',
  [ErrorCode.PERSISTENCE_CORRUPTED_DATA]: 'The saved game data is corrupted.',
  [ErrorCode.PERSISTENCE_STORAGE_UNAVAILABLE]: 'Storage is not available. Please enable cookies and local storage.',
  
  // Validation Errors
  [ErrorCode.VALIDATION_INVALID_INPUT]: 'The input provided is invalid.',
  [ErrorCode.VALIDATION_MISSING_REQUIRED]: 'Required information is missing.',
  [ErrorCode.VALIDATION_FORMAT_ERROR]: 'The format of the input is incorrect.',
  [ErrorCode.VALIDATION_CONSTRAINT_VIOLATION]: 'The input violates constraints.',
  
  // Unknown
  [ErrorCode.UNKNOWN_ERROR]: 'An unexpected error occurred. Please try again.',
};

/**
 * Get a user-friendly error message from an error
 * 
 * @param error - Error object (can be any type)
 * @returns User-friendly error message string
 */
export function getUserFriendlyMessage(error: unknown): string {
  // Handle AppError instances
  if (isAppError(error)) {
    const friendlyMessage = USER_FRIENDLY_MESSAGES[error.code];
    if (friendlyMessage) {
      return friendlyMessage;
    }
    return error.message || USER_FRIENDLY_MESSAGES[ErrorCode.UNKNOWN_ERROR];
  }
  
  // Handle standard Error instances
  if (error instanceof Error) {
    return error.message || USER_FRIENDLY_MESSAGES[ErrorCode.UNKNOWN_ERROR];
  }
  
  // Handle string errors
  if (typeof error === 'string') {
    return error || USER_FRIENDLY_MESSAGES[ErrorCode.UNKNOWN_ERROR];
  }
  
  // Unknown error type
  return USER_FRIENDLY_MESSAGES[ErrorCode.UNKNOWN_ERROR];
}

/**
 * Determine if an error is retryable
 * 
 * @param error - Error object
 * @returns True if the error is retryable, false otherwise
 */
export function isRetryableError(error: unknown): boolean {
  if (isAPIError(error)) {
    // Network errors, timeouts, and 5xx server errors are retryable
    const retryableCodes: number[] = [
      ErrorCode.API_NETWORK_ERROR,
      ErrorCode.API_TIMEOUT,
      ErrorCode.API_SERVER_ERROR,
    ];
    return retryableCodes.includes(error.code);
  }
  
  if (isPersistenceError(error)) {
    // Temporary storage failures might be retryable
    return error.code === ErrorCode.PERSISTENCE_SAVE_FAILED;
  }
  
  // Other errors are generally not retryable
  return false;
}

/**
 * Log an error with context information
 * 
 * @param error - Error object
 * @param context - Additional context for debugging
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
 * Normalize any error into an AppError instance
 * 
 * @param error - Error object (can be any type)
 * @param defaultCode - Default error code to use if error is not an AppError
 * @returns AppError instance
 */
export function normalizeError(
  error: unknown,
  defaultCode: ErrorCode = ErrorCode.UNKNOWN_ERROR
): AppError {
  // Already an AppError
  if (isAppError(error)) {
    return error;
  }
  
  // Standard Error instance
  if (error instanceof Error) {
    return new AppError(error.message || 'An error occurred', defaultCode);
  }
  
  // String error
  if (typeof error === 'string') {
    return new AppError(error, defaultCode);
  }
  
  // Unknown error type
  return new AppError('An unexpected error occurred', defaultCode);
}

/**
 * Factory function to create an APIError with timeout
 */
export function createTimeoutError(endpoint: string, timeoutMs: number): APIError {
  return new APIError(
    `Request to ${endpoint} timed out after ${timeoutMs}ms`,
    ErrorCode.API_TIMEOUT,
    undefined,
    endpoint,
    { timeoutMs }
  );
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
  
  let errorCode: number = ErrorCode.API_SERVER_ERROR;
  let errorMessage = message || `API request failed with status ${statusCode}`;
  
  // Map HTTP status codes to error codes
  if (statusCode === 401 || statusCode === 403) {
    errorCode = ErrorCode.API_UNAUTHORIZED;
    errorMessage = 'Authentication failed';
  } else if (statusCode === 429) {
    errorCode = ErrorCode.API_RATE_LIMIT;
    errorMessage = 'Too many requests';
  } else if (statusCode >= 500) {
    errorCode = ErrorCode.API_SERVER_ERROR;
    errorMessage = 'Server error';
  } else if (statusCode >= 400) {
    errorCode = ErrorCode.API_INVALID_RESPONSE;
    errorMessage = message || 'Invalid request';
  }
  
  return new APIError(errorMessage, errorCode as ErrorCode, statusCode, endpoint);
}

/**
 * Factory function to create a network error
 */
export function createNetworkError(endpoint: string, originalError?: unknown): APIError {
  return new APIError(
    'Network connection failed',
    ErrorCode.API_NETWORK_ERROR,
    undefined,
    endpoint,
    { originalError: originalError instanceof Error ? originalError.message : String(originalError) }
  );
}

/**
 * Factory function to create a game error for invalid moves
 */
export function createInvalidMoveError(move: string, fen?: string): GameError {
  return new GameError(
    `Invalid move: ${move}`,
    ErrorCode.GAME_INVALID_MOVE,
    { move, fen }
  );
}

/**
 * Factory function to create a game error for invalid FEN
 */
export function createInvalidFenError(fen: string, reason?: string): GameError {
  return new GameError(
    reason ? `Invalid FEN: ${reason}` : 'Invalid FEN string',
    ErrorCode.GAME_INVALID_FEN,
    { fen, reason }
  );
}

/**
 * Factory function to create a persistence error for quota exceeded
 */
export function createQuotaExceededError(operation: 'save' | 'import'): PersistenceError {
  return new PersistenceError(
    'Storage quota exceeded',
    ErrorCode.PERSISTENCE_QUOTA_EXCEEDED,
    operation
  );
}

/**
 * Factory function to create a persistence error for storage unavailable
 */
export function createStorageUnavailableError(): PersistenceError {
  return new PersistenceError(
    'Local storage is not available',
    ErrorCode.PERSISTENCE_STORAGE_UNAVAILABLE,
    'save'
  );
}

/**
 * Factory function to create a validation error
 */
export function createValidationError(
  message: string,
  field?: string,
  value?: unknown
): ValidationError {
  return new ValidationError(message, ErrorCode.VALIDATION_INVALID_INPUT, field, value);
}
