import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface RequestWithId extends Request {
  requestId?: string;
}

export function requestIdMiddleware(request: RequestWithId, response: Response, next: NextFunction): void {
  const suppliedId = request.header('x-request-id');
  const requestId = suppliedId && UUID_PATTERN.test(suppliedId) ? suppliedId : randomUUID();
  request.requestId = requestId;
  response.setHeader('x-request-id', requestId);
  next();
}
