import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  deleteMedia,
  listMedia,
  updateMedia,
  uploadMedia,
  type AuthUser,
  type MediaItem,
  type Paged,
} from './api.js';
import { MediaPage } from './MediaPage.js';

vi.mock('./api.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    listMedia: vi.fn(),
    getMedia: vi.fn(),
    uploadMedia: vi.fn(),
    updateMedia: vi.fn(),
    deleteMedia: vi.fn(),
  };
});

const admin: AuthUser = { id: 'u1', username: 'admin', role: 'administrator', status: 'active' };

function makeMedia(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'm1',
    fileName: 'a1b2c3d4.webp',
    originalName: 'sunset.png',
    mimeType: 'image/png',
    sizeBytes: 245760,
    width: 1600,
    height: 900,
    altText: '',
    caption: '',
    description: '',
    url: '/api/media/m1/a1b2c3d4.webp',
    derivatives: {
      '300': '/api/media/m1/a1b2c3d4-300.webp',
      '600': '/api/media/m1/a1b2c3d4-600.webp',
      '1200': '/api/media/m1/a1b2c3d4-1200.webp',
    },
    uploadedById: 'u1',
    createdAt: '2026-10-28T10:00:00.000Z',
    updatedAt: '2026-10-28T10:00:00.000Z',
    ...overrides,
  };
}

function paged(items: MediaItem[], total = items.length): Paged<MediaItem> {
  return {
    items,
    pagination: {
      page: 1,
      perPage: 24,
      total,
      totalPages: total > 0 ? Math.ceil(total / 24) : 0,
    },
  };
}

/** `fireEvent.change` cannot assign a FileList; define it, then dispatch. */
function chooseFiles(input: HTMLElement, files: File[]) {
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  fireEvent.change(input);
}

beforeEach(() => {
  vi.mocked(listMedia).mockResolvedValue(paged([makeMedia()]));
  vi.mocked(uploadMedia).mockImplementation(async (file, options) => {
    options?.onProgress?.(100);
    return makeMedia({
      id: 'm2',
      fileName: 'e5f6a7b8.webp',
      originalName: file.name,
      url: '/api/media/m2/e5f6a7b8.webp',
      derivatives: { '300': '/api/media/m2/e5f6a7b8-300.webp' },
    });
  });
  vi.mocked(updateMedia).mockImplementation(async (id, patch) => makeMedia({ id, ...patch }));
  vi.mocked(deleteMedia).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('media library page', () => {
  it('renders thumbnails with file name, dimensions and size', async () => {
    render(<MediaPage user={admin} />);

    expect(await screen.findByRole('button', { name: 'View sunset.png' })).toBeDefined();
    expect(screen.getByText('sunset.png')).toBeDefined();
    expect(screen.getByText('1600 × 900 · 240 KB')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Media Library (1)' })).toBeDefined();
    expect(vi.mocked(listMedia)).toHaveBeenCalledWith({
      page: 1,
      perPage: 24,
      type: 'image',
    });

    // The grid uses the 300px derivative, not the original.
    const card = screen.getByRole('button', { name: 'View sunset.png' });
    expect(card.querySelector('img')?.getAttribute('src')).toBe('/api/media/m1/a1b2c3d4-300.webp');
  });

  it('searches on the server and resets to page one', async () => {
    render(<MediaPage user={admin} />);
    await screen.findByRole('button', { name: 'View sunset.png' });

    fireEvent.change(screen.getByLabelText('Search Media'), { target: { value: ' sunset ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() =>
      expect(vi.mocked(listMedia)).toHaveBeenLastCalledWith({
        page: 1,
        perPage: 24,
        type: 'image',
        search: 'sunset',
      }),
    );
  });

  it('uploads a file, reports progress completion and inserts the item', async () => {
    render(<MediaPage user={admin} />);
    await screen.findByRole('button', { name: 'View sunset.png' });

    chooseFiles(screen.getByLabelText('Upload media files'), [
      new File(['pixels'], 'beach.png', { type: 'image/png' }),
    ]);

    expect(await screen.findByText('Uploaded')).toBeDefined();
    expect(vi.mocked(uploadMedia)).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: 'View beach.png' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Media Library (2)' })).toBeDefined();
    expect(screen.getByText('Uploaded “beach.png”.')).toBeDefined();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('shows a dismissible notice when the upload is rejected', async () => {
    vi.mocked(uploadMedia).mockRejectedValueOnce(
      new ApiError(400, 'VALIDATION_ERROR', 'Unsupported or corrupt image file'),
    );

    render(<MediaPage user={admin} />);
    await screen.findByRole('button', { name: 'View sunset.png' });

    chooseFiles(screen.getByLabelText('Upload media files'), [
      new File(['not an image'], 'notes.png', { type: 'image/png' }),
    ]);

    expect(await screen.findByText('Unsupported or corrupt image file')).toBeDefined();
    // The item is not added to the grid.
    expect(screen.queryByRole('button', { name: 'View notes.png' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss message' }));
    await waitFor(() => expect(screen.queryByText('Unsupported or corrupt image file')).toBeNull());
  });

  it('surfaces a permission error instead of hiding the upload button', async () => {
    vi.mocked(uploadMedia).mockRejectedValueOnce(new ApiError(403, 'FORBIDDEN', 'Forbidden'));

    render(<MediaPage user={admin} />);
    await screen.findByRole('button', { name: 'View sunset.png' });

    expect(screen.getByRole('button', { name: 'Add New' })).toBeDefined();
    chooseFiles(screen.getByLabelText('Upload media files'), [
      new File(['pixels'], 'beach.png', { type: 'image/png' }),
    ]);

    expect(await screen.findByText('You do not have permission to do that.')).toBeDefined();
  });

  it('edits metadata in the drawer and PATCHes the media item', async () => {
    render(<MediaPage user={admin} />);
    fireEvent.click(await screen.findByRole('button', { name: 'View sunset.png' }));

    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('a1b2c3d4.webp')).toBeDefined();
    expect(within(drawer).getByText('image/png')).toBeDefined();

    fireEvent.change(within(drawer).getByLabelText('Alt text'), {
      target: { value: 'Sunset over the bay' },
    });
    fireEvent.change(within(drawer).getByLabelText('Caption'), {
      target: { value: 'Golden hour' },
    });
    fireEvent.change(within(drawer).getByLabelText('Description'), {
      target: { value: 'Taken from the pier' },
    });
    fireEvent.submit(within(drawer).getByRole('form', { name: 'Media details' }));

    await waitFor(() =>
      expect(vi.mocked(updateMedia)).toHaveBeenCalledWith('m1', {
        altText: 'Sunset over the bay',
        caption: 'Golden hour',
        description: 'Taken from the pier',
      }),
    );
    expect(await screen.findByText('Media details saved.')).toBeDefined();
  });

  it('confirms before deleting and removes the item from the grid', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<MediaPage user={admin} />);
    fireEvent.click(await screen.findByRole('button', { name: 'View sunset.png' }));

    const drawer = await screen.findByRole('dialog');
    fireEvent.click(within(drawer).getByRole('button', { name: 'Delete permanently' }));

    await waitFor(() => expect(vi.mocked(deleteMedia)).toHaveBeenCalledWith('m1'));
    expect(confirmSpy).toHaveBeenCalled();
    expect(await screen.findByText('Deleted “sunset.png”.')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'View sunset.png' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not delete when the confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<MediaPage user={admin} />);
    fireEvent.click(await screen.findByRole('button', { name: 'View sunset.png' }));
    const drawer = await screen.findByRole('dialog');
    fireEvent.click(within(drawer).getByRole('button', { name: 'Delete permanently' }));

    expect(vi.mocked(deleteMedia)).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('shows the empty state when the library has no media', async () => {
    vi.mocked(listMedia).mockResolvedValue(paged([]));

    render(<MediaPage user={admin} />);

    expect(await screen.findByText('No media yet')).toBeDefined();
    expect(screen.getByText('Upload your first image to get started.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Upload Your First Image' })).toBeDefined();
  });

  it('shows an error state with retry', async () => {
    vi.mocked(listMedia)
      .mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'Boom'))
      .mockResolvedValueOnce(paged([makeMedia()]));

    render(<MediaPage user={admin} />);

    expect(await screen.findByText('Could not load media')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'View sunset.png' })).toBeDefined();
  });

  it('pages through the library with the server-side pagination', async () => {
    vi.mocked(listMedia).mockResolvedValue(paged([makeMedia()], 30));

    render(<MediaPage user={admin} />);
    await screen.findByRole('button', { name: 'View sunset.png' });

    expect(screen.getByText('Page 1 of 2')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Next »' }));

    await waitFor(() =>
      expect(vi.mocked(listMedia)).toHaveBeenLastCalledWith({
        page: 2,
        perPage: 24,
        type: 'image',
      }),
    );
    expect(screen.getByText('Page 2 of 2')).toBeDefined();
  });
});
