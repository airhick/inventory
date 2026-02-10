/** @type {import('next').NextConfig} */

const nextConfig = {
  trailingSlash: false,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  assetPrefix: process.env.NEXT_PUBLIC_BASE_PATH || '',
  
  // Pour Docker: génère un build standalone optimisé
  output: 'standalone',

  // En dev : proxy /api vers Flask (port 5000) → une seule URL (localhost:3000)
  async rewrites() {
    return [
      { source: '/api', destination: 'http://localhost:5000/api' },
      { source: '/api/:path*', destination: 'http://localhost:5000/api/:path*' },
    ];
  },

  images: {
    domains: [
      'images.unsplash.com',
      'i.ibb.co',
      'scontent.fotp8-1.fna.fbcdn.net',
      'localhost',
    ],
    unoptimized: true,
  },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

module.exports = nextConfig;
