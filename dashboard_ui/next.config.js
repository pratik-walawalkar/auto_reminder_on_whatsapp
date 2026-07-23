/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, 
  allowedDevOrigins: ["100.*", "*.ts.net", "localhost", "127.0.0.1"],

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY', 
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff', 
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block', 
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin', 
          },
          {
            // --- FIXED CSP: ALLOWS DYNAMIC CONNECTIONS SAFELY ACROSS EXTENDED TAILSCALE WORKSPACES ---
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http://localhost:9444 http://127.0.0.1:9444 ws://localhost:* ws://127.0.0.1:* http://100.*.ts.net:* https://*.ts.net http://*:9444;", 
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

