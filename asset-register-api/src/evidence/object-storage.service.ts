import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createReadStream } from 'node:fs';

@Injectable()
export class ObjectStorageService {
  private readonly bucket = process.env.OBJECT_STORAGE_BUCKET;
  private readonly kmsKeyId = process.env.OBJECT_STORAGE_KMS_KEY_ID;
  private readonly enforceKms = process.env.NODE_ENV === 'production';
  private readonly client = new S3Client({
    region: process.env.OBJECT_STORAGE_REGION || 'ap-south-1',
    ...(process.env.OBJECT_STORAGE_ENDPOINT ? { endpoint: process.env.OBJECT_STORAGE_ENDPOINT, forcePathStyle: true } : {}),
    ...(process.env.OBJECT_STORAGE_ACCESS_KEY_ID && process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY
      ? { credentials: { accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID, secretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY } }
      : {}),
  });

  async createUploadUrl(input: { key: string; contentType: string; sha256: string }) {
    if (!this.bucket) throw new ServiceUnavailableException('Private evidence storage is not configured');
    const checksum = Buffer.from(input.sha256, 'hex').toString('base64');
    const command = new PutObjectCommand({
      Bucket: this.bucket, Key: input.key, ContentType: input.contentType,
      ChecksumSHA256: checksum, Metadata: { sha256: input.sha256 },
      ...(this.enforceKms ? { ServerSideEncryption: 'aws:kms' as const } : {}),
      ...(this.enforceKms && this.kmsKeyId ? { SSEKMSKeyId: this.kmsKeyId } : {}),
    });
    const headers = {
      'content-type': input.contentType,
      'x-amz-checksum-sha256': checksum,
      'x-amz-meta-sha256': input.sha256,
      ...(this.enforceKms ? { 'x-amz-server-side-encryption': 'aws:kms' } : {}),
      ...(this.enforceKms && this.kmsKeyId ? { 'x-amz-server-side-encryption-aws-kms-key-id': this.kmsKeyId } : {}),
    };
    return {
      url: await getSignedUrl(this.client, command, { expiresIn: 600 }),
      headers,
    };
  }

  async verifyUpload(key: string, expected: { contentType: string; byteSize: number; sha256: string }) {
    if (!this.bucket) throw new ServiceUnavailableException('Private evidence storage is not configured');
    const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key, ChecksumMode: 'ENABLED' }));
    if (head.ContentLength !== expected.byteSize || head.ContentType !== expected.contentType || head.Metadata?.sha256 !== expected.sha256) {
      throw new ServiceUnavailableException('Uploaded evidence did not match its reviewed file details');
    }
  }

  async createDownloadUrl(key: string) {
    if (!this.bucket) throw new ServiceUnavailableException('Private evidence storage is not configured');
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: 300 });
  }

  async createExportDownloadUrl(key: string, exportId: string) {
    if (!this.bucket) throw new ServiceUnavailableException('Private export storage is not configured');
    return getSignedUrl(this.client, new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentType: 'text/csv; charset=utf-8',
      ResponseContentDisposition: `attachment; filename="asset-register-${exportId}.csv"`,
      ResponseCacheControl: 'private, no-store',
    }), { expiresIn: 300 });
  }

  async uploadPrivateFile(input: { key: string; filePath: string; byteSize: number; sha256: string; contentType: string }) {
    if (!this.bucket) throw new ServiceUnavailableException('Private export storage is not configured');
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      Body: createReadStream(input.filePath),
      ContentLength: input.byteSize,
      ContentType: input.contentType,
      ChecksumSHA256: Buffer.from(input.sha256, 'hex').toString('base64'),
      Metadata: { sha256: input.sha256 },
      ...(this.enforceKms ? { ServerSideEncryption: 'aws:kms' as const } : {}),
      ...(this.enforceKms && this.kmsKeyId ? { SSEKMSKeyId: this.kmsKeyId } : {}),
    }));
  }

  async deletePrivateObject(key: string) {
    if (!this.bucket) throw new ServiceUnavailableException('Private export storage is not configured');
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
