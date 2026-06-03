/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Twilio and Node.js crypto modules in API routes
  serverExternalPackages: ['twilio'],
}

module.exports = nextConfig
