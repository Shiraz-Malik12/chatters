export default class ApiResponse {
  /**
   * Builds a success response payload.
   * @param {unknown} data - Response data.
   * @param {string} [message='Request successful'] - Success message.
   * @returns {{success: true, data: unknown, message: string}}
   */
  static success(data = null, message = 'Request successful') {
    return {
      success: true,
      data,
      message,
    };
  }

  /**
   * Builds an error response payload.
   * @param {string | object | unknown[]} error - Error details.
   * @param {number} statusCode - HTTP status code.
   * @returns {{success: false, error: string | object | unknown[], statusCode: number}}
   */
  static error(error, statusCode) {
    return {
      success: false,
      error,
      statusCode,
    };
  }
}
