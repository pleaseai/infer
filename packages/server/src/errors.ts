export type ErrorType
  = | 'invalid_request_error'
    | 'authentication_error'
    | 'permission_error'
    | 'not_found_error'
    | 'rate_limit_error'
    | 'api_error'
    | 'not_implemented_error'

export interface ErrorPayload {
  message: string
  type: ErrorType
  code?: string | null
  param?: string | null
}

export interface ErrorBody {
  error: {
    message: string
    type: ErrorType
    code: string | null
    param: string | null
  }
}

export function errorBody(payload: ErrorPayload): ErrorBody {
  return {
    error: {
      message: payload.message,
      type: payload.type,
      code: payload.code ?? null,
      param: payload.param ?? null,
    },
  }
}

export class ApiError extends Error {
  readonly status: number
  readonly body: ErrorBody

  constructor(status: number, payload: ErrorPayload) {
    super(payload.message)
    this.name = 'ApiError'
    this.status = status
    this.body = errorBody(payload)
  }
}

export function invalidRequest(message: string, param?: string, code?: string): ApiError {
  return new ApiError(400, { message, type: 'invalid_request_error', param, code })
}

export function unauthorized(message = 'Missing or invalid Authorization header'): ApiError {
  return new ApiError(401, { message, type: 'authentication_error', code: 'invalid_api_key' })
}

export function modelNotFound(modelId: string): ApiError {
  return new ApiError(404, {
    message: `The model '${modelId}' does not exist`,
    type: 'invalid_request_error',
    code: 'model_not_found',
    param: 'model',
  })
}

export function notImplemented(message: string, code = 'not_implemented'): ApiError {
  return new ApiError(501, { message, type: 'not_implemented_error', code })
}

export function internalError(message = 'Internal server error'): ApiError {
  return new ApiError(500, { message, type: 'api_error' })
}
