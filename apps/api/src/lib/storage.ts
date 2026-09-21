import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { env, need } from './env';

const BUCKET = env('MEDIA_BUCKET') || 'media';
let s3: S3Client | undefined;

export const storageConfigured = () => Boolean(env('AWS_ENDPOINT_URL_S3'));

/** Stores a file in the public_read media bucket and returns its public URL. */
export async function putObject(key: string, body: Buffer, contentType: string): Promise<{ key: string; url: string }> {
  s3 ??= new S3Client({ forcePathStyle: true });
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType, CacheControl: 'public, max-age=31536000, immutable' }));
  return { key, url: `${need('AWS_ENDPOINT_URL_S3').replace(/\/$/, '')}/${BUCKET}/${key}` };
}

export function objectKey(scope: 'product' | 'review', userId: string, fileName: string, mime: string): string {
  const ext = (fileName.split('.').pop() || mime.split('/')[1] || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  return scope === 'product' ? `products/${randomUUID()}.${ext}` : `reviews/${userId}/${randomUUID()}.${ext}`;
}
