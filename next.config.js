/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
