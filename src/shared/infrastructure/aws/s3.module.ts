import { Module } from '@nestjs/common';
import { PemService } from './pem.service';

@Module({
  providers: [PemService],
  exports: [PemService],
})
export class S3Module {}
