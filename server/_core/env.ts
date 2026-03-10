export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  vercelEnv: process.env.VERCEL_ENV ?? "",
  allowDemoMode:
    process.env.NODE_ENV === "development" ||
    process.env.VERCEL_ENV === "preview" ||
    process.env.ALLOW_DEMO_MODE === "true",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  realtimeModel: process.env.REALTIME_MODEL ?? "gpt-realtime",
  realtimeVoice: process.env.REALTIME_VOICE ?? "alloy",
};
