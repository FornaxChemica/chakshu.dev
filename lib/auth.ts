import { betterAuth } from "better-auth";

export const auth = betterAuth({
  appName: "chakshu.dev",
  baseURL: process.env.BETTER_AUTH_URL || "https://chakshu.dev",
  secret:
    process.env.BETTER_AUTH_SECRET ||
    process.env.AUTH_SECRET ||
    "dev-only-change-in-production",
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      prompt: "select_account",
    },
  },
});

