import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors';
import { SplitCalculationError } from '../lib/splits';
import { InvalidMoneyError } from '../lib/money';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Handle Custom App Errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        fields: err.fields,
      },
    });
    return;
  }

  // Handle Split Calculation Errors as 400 Bad Request
  if (err instanceof SplitCalculationError) {
    res.status(400).json({
      error: {
        code: 'SPLIT_ERROR',
        message: err.message,
        fields: err.fieldErrors,
      },
    });
    return;
  }

  // Handle Invalid Money Errors as 400 Bad Request
  if (err instanceof InvalidMoneyError) {
    res.status(400).json({
      error: {
        code: 'INVALID_MONEY',
        message: err.message,
      },
    });
    return;
  }

  // Handle syntax/JSON parsing errors from express
  if ('type' in err && (err as { type: string }).type === 'entity.parse.failed') {
    res.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Malformed JSON payload in request body',
      },
    });
    return;
  }

  // Fallback 500 Internal Server Error
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message:
        process.env.NODE_ENV === 'production'
          ? 'An unexpected error occurred. Please try again later.'
          : err.message || 'Internal server error',
    },
  });
}
