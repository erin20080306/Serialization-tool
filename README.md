# AI Spreadsheet Copilot

AI spreadsheet assistant built with Next.js, NextAuth, Google OAuth, Google Gemini, and Supabase.

## Local Development

```bash
npm install
npm run dev
```

Create `.env.local` from `.env.example`, then fill in the real values.

## Vercel Environment Variables

The Vercel project must have these variables before production login and AI features work:

```bash
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
NEXTAUTH_URL=https://serialization-tool.vercel.app
AUTH_URL=https://serialization-tool.vercel.app
NEXTAUTH_SECRET
AUTH_SECRET
GEMINI_API_KEY
GEMINI_MODEL=gemini-flash-latest
NEXT_PUBLIC_APP_URL=https://serialization-tool.vercel.app
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Supabase is optional for previewing the login UI, but project/history persistence requires a real Supabase URL and keys. `NEXT_PUBLIC_SUPABASE_URL` must look like `https://<project-ref>.supabase.co`.

## Google OAuth

In Google Cloud Console, configure the OAuth client as a Web application and add this authorized redirect URI:

```text
https://serialization-tool.vercel.app/api/auth/callback/google
```

If you test deployment-specific Vercel URLs directly, also add their matching callback URLs or use the production alias above.

## Deployment

```bash
npm run build
git push origin main
```

Vercel is linked to `erins-projects-bc358159/serialization-tool` and deploys `main` to:

```text
https://serialization-tool.vercel.app
```
