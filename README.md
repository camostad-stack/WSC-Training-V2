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
- `DATABASE_URL`
- `VITE_APP_ID`
- `OAUTH_SERVER_URL`
- `OWNER_OPEN_ID`
- `BUILT_IN_FORGE_API_URL`
- `BUILT_IN_FORGE_API_KEY`
- `REALTIME_MODEL`
- `REALTIME_VOICE`

### Demo mode

`ALLOW_DEMO_MODE` controls whether the app can use:

- local role-picker sign-in
- deterministic AI fallback when no provider credentials are configured

Recommended:

- Preview: `ALLOW_DEMO_MODE=true` only if you want demo behavior
- Production: `ALLOW_DEMO_MODE=false`

## Vercel setup

This repo includes:

- `vercel.json` for SPA routing and function config
- `api/[...all].ts` as the serverless API entrypoint
- `server/_core/app.ts` as the shared Express app factory
- `vite.config.ts` configured to build to `public/` on Vercel and `dist/public` locally

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
- For real production usage, do not rely on demo mode.
- If you need persistent demo data, connect a real managed MySQL database and run migrations/seeds against it.
