/** Browser requests must come from a loopback web origin, not an arbitrary site.
 * Native local clients may omit Origin; browser WebSocket clients cannot. */
export function isLocalDevelopmentOrigin(origin: string | undefined): boolean {
  if (origin === undefined) return true;
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      && url.username === '' && url.password === ''
      && url.origin === origin;
  } catch {
    return false;
  }
}
