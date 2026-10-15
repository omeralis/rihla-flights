export function GET() {
  return Response.json({ status: 'ok', engine: 'CloakBrowser', framework: 'Next.js', proxyRotation: 'socks4-fallback' });
}
