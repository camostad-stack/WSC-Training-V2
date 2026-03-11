import { getSupabaseAdmin } from "./_core/supabase";
import { ENV } from "./_core/env";

export type StorageBucket = "session-media" | "policy-documents" | "generated-assets";

const DEFAULT_BUCKETS: Record<StorageBucket, string> = {
  "session-media": ENV.supabaseSessionMediaBucket,
  "policy-documents": ENV.supabasePolicyDocumentsBucket,
  "generated-assets": ENV.supabaseGeneratedAssetsBucket,
};

function resolveBucket(bucket: StorageBucket) {
  const bucketName = DEFAULT_BUCKETS[bucket];
  if (!bucketName) {
    throw new Error(`Supabase bucket is not configured for ${bucket}`);
  }
  return bucketName;
}

function normalizeKey(key: string) {
  return key.replace(/^\/+/, "");
}

function splitBucketAndKey(path: string, fallbackBucket: StorageBucket = "generated-assets") {
  const normalized = normalizeKey(path);
  const segments = normalized.split("/");
  const bucketMatch = (Object.keys(DEFAULT_BUCKETS) as StorageBucket[]).find(
    (bucket) => segments[0] === resolveBucket(bucket),
  );

  if (bucketMatch) {
    return {
      bucketName: resolveBucket(bucketMatch),
      key: segments.slice(1).join("/"),
    };
  }

  return {
    bucketName: resolveBucket(fallbackBucket),
    key: normalized,
  };
}

function toBlob(data: Buffer | Uint8Array | string, contentType: string) {
  if (typeof data === "string") {
    return new Blob([data], { type: contentType });
  }
  return new Blob([new Uint8Array(data)], { type: contentType });
}

export function buildStoragePath(bucket: StorageBucket, key: string) {
  const bucketName = resolveBucket(bucket);
  return `${bucketName}/${normalizeKey(key)}`;
}

export function getSupabaseStoragePublicUrl(path: string, fallbackBucket?: StorageBucket) {
  const { bucketName, key } = splitBucketAndKey(path, fallbackBucket);
  return getSupabaseAdmin().storage.from(bucketName).getPublicUrl(key).data.publicUrl;
}

export async function createSignedStorageUrl(path: string, options?: {
  expiresIn?: number;
  fallbackBucket?: StorageBucket;
}) {
  const { bucketName, key } = splitBucketAndKey(path, options?.fallbackBucket);
  const { data, error } = await getSupabaseAdmin().storage
    .from(bucketName)
    .createSignedUrl(key, options?.expiresIn ?? 60 * 60);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Failed to create signed storage URL");
  }

  return data.signedUrl;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
  bucket: StorageBucket = "generated-assets",
): Promise<{ key: string; url: string }> {
  const bucketName = resolveBucket(bucket);
  const key = normalizeKey(relKey);
  const { error } = await getSupabaseAdmin().storage.from(bucketName).upload(key, toBlob(data, contentType), {
    contentType,
    upsert: true,
  });

  if (error) {
    throw new Error(`Supabase storage upload failed: ${error.message}`);
  }

  const storagePath = buildStoragePath(bucket, key);
  return {
    key: storagePath,
    url: getSupabaseStoragePublicUrl(storagePath, bucket),
  };
}

export async function storageGet(
  path: string,
  options?: { expiresIn?: number; fallbackBucket?: StorageBucket },
): Promise<{ key: string; url: string }> {
  const normalizedPath = normalizeKey(path);
  return {
    key: normalizedPath,
    url: await createSignedStorageUrl(normalizedPath, options),
  };
}
