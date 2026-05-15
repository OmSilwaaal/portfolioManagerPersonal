function sessionMiddleware(req, res, next) {
  req.sessionId = req.headers['x-session-id'] || null;
  next();
}

module.exports = { sessionMiddleware };
