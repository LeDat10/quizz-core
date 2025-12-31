// import { Body, Controller, Get, Param, Post, Request } from '@nestjs/common';
// import { StatusCascadeService } from '../application/services/status-cascade.service';
// import {
//   BulkCascadeDto,
//   StartCascadeDto,
// } from '../application/dtos/start-cascade.dto';
// import { Request } from 'express';

// @Controller('cascade')
// export class StatusCascadeController {
//   constructor(private readonly cascadeService: StatusCascadeService) {}

//   /**
//    * POST /cascade/start
//    * Start cascade for single entity
//    */
//   @Post('start')
//   async startCascade(@Body() dto: StartCascadeDto, @Request() req: any) {
//     return this.cascadeService.startCascade(dto, req.user.id as string);
//   }

//   /**
//    * POST /cascade/bulk
//    * Start cascade for multiple entities
//    */
//   @Post('bulk')
//   async startBulkCascade(@Body() dto: BulkCascadeDto, @Request() req: any) {
//     return this.cascadeService.startBulkCascade(dto, req.user.id);
//   }

//   /**
//    * GET /cascade/:batchId/progress
//    * Get cascade progress
//    */
//   @Get(':batchId/progress')
//   async getProgress(@Param('batchId') batchId: string) {
//     return this.cascadeService.getProgress(batchId);
//   }

//   /**
//    * POST /cascade/:batchId/cancel
//    * Cancel ongoing cascade
//    */
//   @Post(':batchId/cancel')
//   async cancelCascade(@Param('batchId') batchId: string) {
//     return this.cascadeService.cancelCascade(batchId);
//   }
// }
