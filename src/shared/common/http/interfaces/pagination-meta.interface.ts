export interface PaginationMeta {
  itemsPerPage: number;
  totalItems: number;
  currentPage: number;
  totalPages: number;
}

export interface PaginationLinks {
  first: string;
  last: string;
  current: string;
  next: string | null;
  previous: string | null;
}
