import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const supabase = createClient(
  requireEnv("SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

const buckets = [
  { id: process.env.SUPABASE_SESSION_MEDIA_BUCKET || "session-media", public: false },
  { id: process.env.SUPABASE_POLICY_DOCUMENTS_BUCKET || "policy-documents", public: false },
  { id: process.env.SUPABASE_GENERATED_ASSETS_BUCKET || "generated-assets", public: true },
] as const;

async function ensureBucket(bucket: (typeof buckets)[number]) {
  const { data: existing, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    throw new Error(`Failed to list buckets: ${listError.message}`);
  }

  if (existing.find((item) => item.id === bucket.id)) {
    console.log(`Bucket exists: ${bucket.id}`);
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(bucket.id, {
    public: bucket.public,
    fileSizeLimit: "52428800",
  });

  if (createError) {
    throw new Error(`Failed to create bucket ${bucket.id}: ${createError.message}`);
  }

  console.log(`Bucket created: ${bucket.id}`);
}

async function main() {
  for (const bucket of buckets) {
    await ensureBucket(bucket);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
