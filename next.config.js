/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      // Clean URL for the static staging showcase in public/staging-sample/
      { source: '/staging-sample', destination: '/staging-sample/index.html' },
    ]
  },
}

module.exports = nextConfig
