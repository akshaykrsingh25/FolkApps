import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';

@Injectable()
export class ObjectStorageService {
  private readonly bucket = process.env.OBJECT_STORAGE_BUCKET;
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
    });
    return {
      url: await getSignedUrl(this.client, command, { expiresIn: 600 }),
      headers: { 'content-type': input.contentType, 'x-amz-checksum-sha256': checksum, 'x-amz-meta-sha256': input.sha256 },
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
}
