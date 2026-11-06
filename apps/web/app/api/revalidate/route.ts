import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { PUBLIC_CONTENT_TAG } from '@/lib/api';

/**
 * Cache revalidation webhook (ADR 0056).
 *
 * The API calls this after a content or taxonomy commit on the private web
 * origin. It is deliberately not exposed publicly: Caddy routes `/api/*` to
 * Fastify, so only the API process (127.0.0.1:3100) can reach it.
 *
 * The secret is compared as SHA-256 digests with a timing-safe equality, and
 * only known tags are accepted so a compromised caller cannot flush arbitrary
 * cache entries.
 */
const ALLOWED_TAGS = new Set<string>([PUBLIC_CONTENT_TAG]);
const encoder = new TextEncoder();

/** SHA-256 via Web Crypto: no Node built-ins in the browser app bundle. */
async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

/** Byte-wise constant-time comparison (same cost regardless of match). */
function equalDigests(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
}

async function authorized(request: Request, secret: string): Promise<boolean> {
  const provided = request.headers.get('x-revalidate-secret');
  if (!provided || provided.length > 200) return false;
  const [providedDigest, secretDigest] = await Promise.all([digest(provided), digest(secret)]);
  return equalDigests(providedDigest, secretDigest);
}

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.MERNPRESS_REVALIDATE_SECRET ?? '';
  if (secret.length < 16) {
    return NextResponse.json(
      { error: { code: 'REVALIDATE_DISABLED', message: 'Revalidation is not configured.' } },
      { status: 503 },
    );
  }
  if (!(await authorized(request, secret))) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Invalid revalidation secret.' } },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body.' } },
      { status: 400 },
    );
  }
  const tags = (body as { tags?: unknown } | null)?.tags;
  if (!Array.isArray(tags) || tags.length === 0 || tags.length > 10) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'tags must be a non-empty array.' } },
      { status: 400 },
    );
  }
  const unknown = tags.filter((tag): boolean => typeof tag !== 'string' || !ALLOWED_TAGS.has(tag));
  if (unknown.length > 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Unknown cache tag.' } },
      { status: 400 },
    );
  }

  for (const tag of tags as string[]) {
    // expire: 0 drops the cached entry immediately; the "max" profile allows
    // one stale response while revalidating in the background, which would make
    // a publish visible only on the second request.
    revalidateTag(tag, { expire: 0 });
  }
  return NextResponse.json({ revalidated: tags });
}
