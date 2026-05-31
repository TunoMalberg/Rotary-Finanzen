/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use different output dir ONLY for local production builds
  output: 'standalone',
  distDir: process.env.NODE_ENV === 'production'
    ? (process.env.BUILD_DIR || '.next-build')
    : '.next',
  // pdfjs-serverless lädt sein PDF-Modul zur Laufzeit – nicht durch den
  // Bundler ziehen, sondern aus node_modules laden lassen.
  // pdfkit muss ebenfalls extern bleiben, damit seine AFM-Font-Dateien
  // (js/data/*.afm) zur Laufzeit gefunden werden statt vom Webpack-Bundler
  // verschluckt zu werden (führt sonst zu ENOENT Helvetica.afm auf Vercel).
  serverExternalPackages: ['pdfjs-serverless', 'pdfjs-dist', 'pdfkit', 'fontkit'],
  // Vercel/Next-Tracer in den AFM-Datenpfad zwingen, damit die Lambda-Bundles
  // die pdfkit-Schrift-Metriken enthalten.
  outputFileTracingIncludes: {
    '/api/reports/treasurer': [
      './node_modules/pdfkit/js/data/**/*',
    ],
    '/api/reports/treasurer/route': [
      './node_modules/pdfkit/js/data/**/*',
    ],
  },
  // Enable CORS for Design Mode to load resources cross-origin (dev only)
  // Note: Do NOT set allowedDevOrigins - the default allows all origins in dev mode
  async headers() {
    // Only add permissive CORS headers in development
    if (process.env.NODE_ENV !== 'development') {
      return [];
    }
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: '*' },
        ],
      },
    ];
  },
  images: {
    unoptimized: true,
    domains: [
      "source.unsplash.com",
      "images.unsplash.com",
      "ext.same-assets.com",
      "ugc.same-assets.com",
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "source.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "ext.same-assets.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "ugc.same-assets.com",
        pathname: "/**",
      },
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
