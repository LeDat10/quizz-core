import { Injectable } from '@nestjs/common';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';

@Injectable()
export class PemService {
  private s3: S3Client | null = null;
  private isDev: boolean;

  constructor(private readonly configService: ConfigService) {
    this.isDev = this.configService.get<string>('NODE_ENV') === 'development';

    if (!this.isDev) {
      this.s3 = new S3Client({
        region:
          this.configService.get<string>('AWS_REGION') || 'ap-southeast-2',
        credentials: {
          accessKeyId:
            this.configService.get<string>('AWS_ACCESS_KEY_ID') || '',
          secretAccessKey:
            this.configService.get<string>('AWS_SECRET_ACCESS_KEY') || '',
        },
      });
    }
  }

  async getPem(bucket: string, key: string): Promise<string | undefined> {
    if (this.isDev) {
      return undefined;
    }

    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const data = await this.s3!.send(command);

    const stream = data.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf-8');
  }
}
