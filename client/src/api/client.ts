export interface ApiErrorResponse {
  code: string;
  message: string;
  fields?: Record<string, string>;
}

export class ApiError extends Error {
  public code: string;
  public fields?: Record<string, string>;
  public statusCode: number;

  constructor(statusCode: number, error: ApiErrorResponse) {
    super(error.message || 'API request failed');
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = error.code || 'UNKNOWN_ERROR';
    this.fields = error.fields;
  }
}

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('token');
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    const errorData: ApiErrorResponse = data?.error || {
      code: 'HTTP_ERROR',
      message: res.statusText || 'An unexpected error occurred',
    };
    throw new ApiError(res.status, errorData);
  }

  return data as T;
}
