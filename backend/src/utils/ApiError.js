export default class ApiError extends Error {
  /**
   * Creates a standardized operational API error.
   * @param {number} statusCode - HTTP status code.
   * @param {string} message - Human-readable error message.
   * @param {boolean} [isOperational=true] - Whether this is an expected operational error.
   */
  constructor(statusCode, message, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.message = message;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}
