import { Status } from 'src/shared/common/status';

export class AdminResponseCategoryDto {
  id: string;
  slug: string;
  title: string;
  description?: string;
  thumbnail?: string;
  status: Status;
  position: number;
  createdAt: Date;
  updatedAt?: Date;
  deletedAt?: Date;
}
