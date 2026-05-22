export function apiUrl(baseUrl: string, path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('path must be a same-origin absolute path');
  }

  if (baseUrl.startsWith('/')) {
    if (baseUrl.startsWith('//') || baseUrl.includes('?') || baseUrl.includes('#')) {
      throw new Error('apiBaseUrl must be a same-origin absolute path without query or hash');
    }

    return `${trimTrailingSlash(baseUrl)}${path}`;
  }

  let parsedBase: URL;
  try {
    parsedBase = new URL(baseUrl);
  } catch {
    throw new Error('apiBaseUrl must be an absolute HTTP(S) URL or same-origin path');
  }

  if (parsedBase.protocol !== 'http:' && parsedBase.protocol !== 'https:') {
    throw new Error('apiBaseUrl must use http or https');
  }

  if (parsedBase.search !== '' || parsedBase.hash !== '') {
    throw new Error('apiBaseUrl must not include a query string or hash fragment');
  }

  return `${trimTrailingSlash(baseUrl)}${path}`;
}

export function shortUrlFromPath(origin: string, shortPath: string): string {
  if (!shortPath.startsWith('/') || shortPath.startsWith('//')) {
    throw new Error('shortPath must be a same-origin absolute path');
  }

  const normalisedOrigin = origin.endsWith('/') ? origin.slice(0, -1) : origin;
  return `${normalisedOrigin}${shortPath}`;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}
