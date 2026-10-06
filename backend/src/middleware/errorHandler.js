const isProd = process.env.NODE_ENV === 'production';

function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  // Log full detail server-side only
  console.error(`[error] ${req.method} ${req.path}:`, status >= 500 ? err : err.message);

  if (res.headersSent) return next(err);

  // Never leak internal error text (DB / upstream API messages) on 5xx responses in production
  const message = status >= 500 && isProd ? 'Internal server error' : (err.message || 'Internal server error');

  res.status(status).json({
    error: true,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: true, message: 'Route not found.' });
}

module.exports = { errorHandler, notFoundHandler };
