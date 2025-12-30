export class CascadeProgressDto {
  batchId: string;
  isDone: boolean;
  progress: {
    total: number;
    completed: number;
    failed: number;
    active: number;
    percentage: number;
  };
  levels: Array<{
    level: number;
    total: number;
    completed: number;
    failed: number;
  }>;
}
