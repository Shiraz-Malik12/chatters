import AppError from '../utils/AppError.js';

const notFound = (request, response, next) => {
  next(new AppError(`Route not found: ${request.originalUrl}`, 404));
};

const errorHandler = (error, request, response, next) => {
  const statusCode = error.statusCode || 500;
  const status = error.status || 'error';

  if (error.name === 'CastError') {
    return response.status(400).json({
      success: false,
      message: 'Invalid resource identifier',
    });
  }

  if (error.code === 11000) {
    return response.status(409).json({
      success: false,
      message: 'Duplicate field value',
    });
  }

  return response.status(statusCode).json({
    success: false,
    status,
    message: error.message || 'Internal server error',
  });
};

export { notFound, errorHandler };
