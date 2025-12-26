/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {},
  env: {
    NEXT_PUBLIC_ADMIN_SECRET_KEY: process.env.ADMIN_SECRET_KEY,
  },
}

module.exports = nextConfig