# WSC AI Training App

Woodinville Sports Club training platform for employee practice, manager review, and admin operations.

## Local development

Install dependencies:

```bash
pnpm install
```

Run the app locally with hot reload:

```bash
pnpm dev
```

That gives you:

- Vite-powered frontend HMR
- Express + tRPC backend on the same local server
- fast local iteration while editing files

## Vercel deployment model

This repo is configured for:

- Vercel preview deployments from branches / pull requests
- Vercel production deployments from `main`
- one Vercel project serving both the SPA and the API routes
- frontend built into root `public/` during Vercel builds

### Important behavior

Local development and deployed environments behave differently:

- Local: edits update immediately with hot reload while `pnpm dev` is running
- Vercel preview: a new deployment is created after each push; refresh the preview URL after the build finishes
- Vercel production: a new production deployment is created when `main` is updated

If by "live update" you mean editing code and watching the browser update instantly, that works locally, not on the hosted Vercel site.

If by "live update" you mean pushing code and having the hosted app update automatically, that works with GitHub + Vercel integration.

## Recommended long-term workflow

1. Push this repo to GitHub.
2. Import the GitHub repo into Vercel.
3. Set production and preview environment variables in Vercel Project Settings.
4. Use:
   - feature branches for preview deployments
   - `main` for production deployments

## Required environment variables

Set these in Vercel for both Preview and Production as needed:

- `JWT_SECRET`
- `DATABASE_URL` using the Supabase `Connect` -> `Transaction pooler` string
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SESSION_MEDIA_BUCKET`
- `SUPABASE_POLICY_DOCUMENTS_BUCKET`
- `SUPABASE_GENERATED_ASSETS_BUCKET`
- `SUPABASE_SEED_PASSWORD`
- `BUILT_IN_FORGE_API_URL`
- `BUILT_IN_FORGE_API_KEY`
- `REALTIME_MODEL`
- `REALTIME_VOICE`

## Vercel setup

This repo includes:

- `vercel.json` for SPA routing and function config
- `api/trpc/index.ts` and `api/trpc/[...trpc].ts` as the serverless API entrypoints
- `server/_core/app.ts` as the shared Express app factory
- `vite.config.ts` configured to build to `public/` on Vercel and `dist/public` locally

In Vercel Project Settings:

- Framework Preset: `Other`
- Install Command: `pnpm install --frozen-lockfile`
- Build Command: `pnpm build:vercel`

## Validation

Before pushing, run:

```bash
pnpm check
pnpm test
pnpm build
```

## Notes

- GitHub is the source of truth.
- Vercel handles deployments.
- This app is now designed for Supabase Postgres, Supabase Auth, and Supabase Storage.
- Use the Supabase transaction pooler connection string for `DATABASE_URL`; it is the most reliable option for Vercel and remote CLI access.
- For a fresh project, create the three buckets above, then run `pnpm db:push` and `pnpm db:seed`.
