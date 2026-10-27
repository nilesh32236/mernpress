export type TaxonomyType = 'category' | 'tag';

/** Filter draft passed through `taxonomy.term.create`/`taxonomy.term.update`. */
export interface TermFilterDraft {
  taxonomy: TaxonomyType;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
}

/** Action payload: identifiers + taxonomy only. */
export interface TermActionPayload {
  termId: string;
  taxonomy: TaxonomyType;
  slug: string;
  /** Set on delete: number of detached post relationships. */
  detachedPostCount?: number;
}

export interface AdminTerm {
  id: string;
  taxonomy: TaxonomyType;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  /** Computed count of assigned posts/pages (never a stored counter). */
  postCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTermInput {
  taxonomy: TaxonomyType;
  name: string;
  slug?: string | undefined;
  description?: string | null | undefined;
  parentId?: string | null | undefined;
}

export interface UpdateTermInput {
  name?: string | undefined;
  slug?: string | undefined;
  description?: string | null | undefined;
  parentId?: string | null | undefined;
}

export type TermSort = 'name' | 'createdAt' | 'updatedAt';

export interface TermListQuery {
  taxonomy?: TaxonomyType | undefined;
  search?: string | undefined;
  page: number;
  perPage: number;
  sort: TermSort;
  order: 'asc' | 'desc';
}
