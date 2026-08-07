/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // PDFKit loads its built-in AFM fonts relative to its installed package.
  // Keeping it external on the Node.js server preserves that directory instead
  // of rewriting __dirname to .next/server/vendor-chunks.
  serverExternalPackages: ['pdfkit'],
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          '**/node_modules/**',
          '**/.next/**',
          'C:/DumpStack.log.tmp',
          'C:/hiberfil.sys',
          'C:/pagefile.sys',
          'C:/swapfile.sys',
          'C:\\DumpStack.log.tmp',
          'C:\\hiberfil.sys',
          'C:\\pagefile.sys',
          'C:\\swapfile.sys',
        ],
      }
    }

    return config
  },
  images: {
    domains: [],
  },
}

module.exports = nextConfig
