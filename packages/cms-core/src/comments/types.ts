export type CommentStatus = 'PENDING' | 'APPROVED' | 'SPAM' | 'TRASHED';

export interface PublicComment {
  id: string;
  parentId: string | null;
  authorName: string;
  authorUrl: string | null;
  content: string;
  status: CommentStatus;
  createdAt: string;
}

export interface AdminComment {
  id: string;
  postId: string;
  postTitle: string;
  postSlug: string;
  userId: string | null;
  parentId: string | null;
  authorName: string;
  authorEmail: string;
  authorUrl: string | null;
  content: string;
  status: CommentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CommentListQuery {
  status?: CommentStatus | undefined;
  postId?: string | undefined;
  search?: string | undefined;
  page: number;
  perPage: number;
}

export interface CommentCounts {
  all: number;
  pending: number;
  approved: number;
  spam: number;
  trashed: number;
  mine: number;
}

export interface CreateCommentInput {
  userId?: string | null | undefined;
  authorName: string;
  authorEmail: string;
  authorUrl?: string | null | undefined;
  content: string;
  parentId?: string | null | undefined;
}

export interface UpdateCommentInput {
  authorName?: string | undefined;
  authorEmail?: string | undefined;
  authorUrl?: string | null | undefined;
  content?: string | undefined;
}
