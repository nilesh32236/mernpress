import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  deleteMedia,
  editMediaImage,
  createMediaFolder,
  deleteMediaFolder,
  listMedia,
  listMediaFolders,
  regenerateMediaDerivatives,
  renameMediaFolder,
  moveMediaFolder,
  restoreMediaOriginal,
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
    listMediaFolders: vi.fn(),
    createMediaFolder: vi.fn(),
    renameMediaFolder: vi.fn(),
    moveMediaFolder: vi.fn(),
    deleteMediaFolder: vi.fn(),
    regenerateMediaDerivatives: vi.fn(),
    getMedia: vi.fn(),
    uploadMedia: vi.fn(),
    updateMedia: vi.fn(),
    deleteMedia: vi.fn(),
    editMediaImage: vi.fn(),
    restoreMediaOriginal: vi.fn(),
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
    folderId: null,
    editedAt: null,
    hasOriginal: false,
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
  vi.mocked(editMediaImage).mockResolvedValue(makeMedia());
  vi.mocked(restoreMediaOriginal).mockResolvedValue(makeMedia());
  vi.mocked(regenerateMediaDerivatives).mockResolvedValue({
    processed: 1,
    failed: 0,
    remaining: 0,
    nextAfter: null,
  });
  vi.mocked(listMediaFolders).mockResolvedValue([]);
  // jsdom has no 2D canvas; the editor still renders its controls.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
  window.localStorage.removeItem('mernpress.infiniteScroll');
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('media library page', () => {
  it('renders attachment thumbnails in the grid', async () => {
    render(<MediaPage user={admin} />);

    expect(await screen.findByRole('button', { name: 'View sunset.png' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Media Library' })).toBeDefined();
    expect(vi.mocked(listMedia)).toHaveBeenCalledWith({
      page: 1,
      perPage: 24,
      order: 'newest',
      type: 'image',
    });

    // The grid uses the 300px derivative, not the original.
    const card = screen.getByRole('button', { name: 'View sunset.png' });
    expect(card.querySelector('img')?.getAttribute('src')).toBe(
      '/api/media/m1/a1b2c3d4-300.webp?v=2026-10-28T10%3A00%3A00.000Z',
    );
  });

  it('searches on the server and resets to page one', async () => {
    render(<MediaPage user={admin} />);
    await screen.findByRole('button', { name: 'View sunset.png' });

    // Media search is live (debounced), matching WordPress: no Search button.
    fireEvent.change(screen.getByLabelText('Search media'), { target: { value: ' sunset ' } });

    await waitFor(
      () =>
        expect(vi.mocked(listMedia)).toHaveBeenLastCalledWith({
          page: 1,
          perPage: 24,
          order: 'newest',
          type: 'image',
          search: 'sunset',
        }),
      { timeout: 3000 },
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
    expect(screen.getByRole('heading', { name: 'Media Library' })).toBeDefined();
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

    expect(screen.getByRole('button', { name: 'Add Media File' })).toBeDefined();
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

    fireEvent.change(within(drawer).getByLabelText('Alternative Text'), {
      target: { value: 'Sunset over the bay' },
    });
    fireEvent.change(within(drawer).getByLabelText('Image Caption'), {
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
        folderId: null,
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
    // WordPress uses infinite scrolling in the grid by default; pagination is
    // the fallback when the profile preference disables it.
    window.localStorage.setItem('mernpress.infiniteScroll', '0');
    vi.mocked(listMedia).mockResolvedValue(paged([makeMedia()], 30));

    render(<MediaPage user={admin} />);
    await screen.findByRole('button', { name: 'View sunset.png' });

    expect(screen.getByText('Page 1 of 2')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));

    await waitFor(() =>
      expect(vi.mocked(listMedia)).toHaveBeenLastCalledWith({
        page: 2,
        perPage: 24,
        order: 'newest',
        type: 'image',
      }),
    );
    expect(screen.getByText('Page 2 of 2')).toBeDefined();
  });
  it('opens the image editor from the media drawer', async () => {
    render(<MediaPage user={admin} />);
    fireEvent.click(await screen.findByRole('button', { name: 'View sunset.png' }));

    fireEvent.click(screen.getByRole('button', { name: 'Edit Image' }));

    const editor = await screen.findByRole('dialog', { name: 'Edit image' });
    expect(within(editor).getByRole('heading', { name: 'Edit Image' })).toBeDefined();
    expect(within(editor).getByRole('button', { name: 'Rotate left' })).toBeDefined();
    expect(within(editor).getByRole('button', { name: 'Rotate right' })).toBeDefined();
    expect(within(editor).getByRole('button', { name: 'Rotate 180°' })).toBeDefined();
    expect(within(editor).getByRole('button', { name: 'Flip vertical' })).toBeDefined();
    expect(within(editor).getByRole('button', { name: 'Flip horizontal' })).toBeDefined();
    expect(within(editor).getByRole('button', { name: 'Undo' })).toBeDefined();
    expect(within(editor).getByRole('button', { name: 'Redo' })).toBeDefined();
    expect(within(editor).getByRole('button', { name: 'Crop' })).toBeDefined();
    expect(within(editor).getByRole('button', { name: 'Scale' })).toBeDefined();
    expect(within(editor).getByRole('button', { name: 'Save' })).toBeDefined();

    fireEvent.click(within(editor).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit image' })).toBeNull());
  });
  it('regenerates image sizes in batches and reports the total', async () => {
    vi.mocked(regenerateMediaDerivatives)
      .mockResolvedValueOnce({ processed: 2, failed: 0, remaining: 1, nextAfter: 'm2' })
      .mockResolvedValueOnce({ processed: 1, failed: 1, remaining: 0, nextAfter: null });
    render(<MediaPage user={admin} />);
    await screen.findByRole('button', { name: 'View sunset.png' });

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate image sizes' }));

    await waitFor(() => expect(vi.mocked(regenerateMediaDerivatives)).toHaveBeenCalledTimes(2));
    expect(vi.mocked(regenerateMediaDerivatives)).toHaveBeenNthCalledWith(1, { limit: 20 });
    expect(vi.mocked(regenerateMediaDerivatives)).toHaveBeenNthCalledWith(2, {
      after: 'm2',
      limit: 20,
    });
    expect(await screen.findByText('Regenerated 3 image(s); 1 failed.')).toBeDefined();
  });
  it('creates a folder and filters the library by folder', async () => {
    const travel = {
      id: 'f1',
      name: 'Travel',
      parentId: null,
      itemCount: 2,
      createdAt: '2026-11-05T10:00:00.000Z',
      updatedAt: '2026-11-05T10:00:00.000Z',
    };
    vi.mocked(listMediaFolders).mockResolvedValueOnce([]).mockResolvedValue([travel]);
    vi.mocked(createMediaFolder).mockResolvedValue(travel);

    render(<MediaPage user={admin} />);
    await screen.findByRole('button', { name: 'View sunset.png' });
    await waitFor(() => expect(vi.mocked(listMediaFolders)).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('New folder name'), {
      target: { value: 'Travel' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create folder' }));

    await waitFor(() => expect(vi.mocked(createMediaFolder)).toHaveBeenCalledWith('Travel', null));
    expect(await screen.findByText('Folder “Travel” created.')).toBeDefined();
    const filter = (await screen.findByLabelText('Filter by folder')) as HTMLSelectElement;
    await waitFor(() => expect(filter.value).toBe('f1'));
    expect(screen.getByRole('option', { name: 'Travel (2)' })).toBeDefined();
    await waitFor(() =>
      expect(vi.mocked(listMedia)).toHaveBeenLastCalledWith(
        expect.objectContaining({ folder: 'f1' }),
      ),
    );

    fireEvent.change(filter, { target: { value: 'none' } });
    await waitFor(() =>
      expect(vi.mocked(listMedia)).toHaveBeenLastCalledWith(
        expect.objectContaining({ folder: 'none' }),
      ),
    );
  });

  it('assigns a media item to a folder and renames/deletes folders', async () => {
    const travel = {
      id: 'f1',
      name: 'Travel',
      parentId: null,
      itemCount: 1,
      createdAt: '2026-11-05T10:00:00.000Z',
      updatedAt: '2026-11-05T10:00:00.000Z',
    };
    vi.mocked(listMediaFolders).mockResolvedValue([travel]);
    vi.mocked(updateMedia).mockImplementation(async (id, patch) => makeMedia({ id, ...patch }));
    vi.mocked(renameMediaFolder).mockResolvedValue({ ...travel, name: 'Trips' });
    vi.mocked(deleteMediaFolder).mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<MediaPage user={admin} />);
    fireEvent.click(await screen.findByRole('button', { name: 'View sunset.png' }));
    await screen.findByRole('heading', { name: 'Attachment details' });

    fireEvent.change(screen.getByLabelText('Folder'), { target: { value: 'f1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(vi.mocked(updateMedia)).toHaveBeenCalledWith(
        'm1',
        expect.objectContaining({ folderId: 'f1' }),
      ),
    );

    // Rename and delete through the folder bar.
    const filter = screen.getByLabelText('Filter by folder') as HTMLSelectElement;
    fireEvent.change(filter, { target: { value: 'f1' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Rename folder' }));
    fireEvent.change(screen.getByLabelText('Folder name'), {
      target: { value: 'Trips' },
    });
    const renameForm = screen.getByLabelText('Folder name').closest('form')!;
    fireEvent.click(within(renameForm).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(vi.mocked(renameMediaFolder)).toHaveBeenCalledWith('f1', 'Trips'));

    fireEvent.click(await screen.findByRole('button', { name: 'Delete folder' }));
    await waitFor(() => expect(vi.mocked(deleteMediaFolder)).toHaveBeenCalledWith('f1'));
    expect(
      await screen.findByText(
        'Folder deleted; child folders moved up. Media items directly in it are now Uncategorized.',
      ),
    ).toBeDefined();
  });
  it('creates nested folders, indents the tree and moves a folder safely', async () => {
    const root = {
      id: 'root',
      name: 'Root',
      parentId: null,
      itemCount: 0,
      createdAt: '2026-11-06T10:00:00.000Z',
      updatedAt: '2026-11-06T10:00:00.000Z',
    };
    const child = {
      id: 'child',
      name: 'Child',
      parentId: 'root',
      itemCount: 0,
      createdAt: '2026-11-06T10:00:00.000Z',
      updatedAt: '2026-11-06T10:00:00.000Z',
    };
    vi.mocked(listMediaFolders).mockResolvedValue([root, child]);
    vi.mocked(createMediaFolder).mockResolvedValue({
      ...child,
      id: 'grandchild',
      name: 'Grandchild',
    });
    vi.mocked(moveMediaFolder).mockResolvedValue({ ...child, parentId: null });

    render(<MediaPage user={admin} />);
    await screen.findByRole('button', { name: 'View sunset.png' });
    await waitFor(() => expect(vi.mocked(listMediaFolders)).toHaveBeenCalled());

    const filter = (await screen.findByLabelText('Filter by folder')) as HTMLSelectElement;
    await waitFor(() =>
      expect([...filter.options].map((option) => option.textContent?.trim())).toEqual([
        'All folders',
        'Uncategorized',
        'Root (0)',
        '— Child (0)',
      ]),
    );

    // The attachment drawer uses the same indented tree as the folder bar.
    fireEvent.click(screen.getByRole('button', { name: 'View sunset.png' }));
    await screen.findByRole('heading', { name: 'Attachment details' });
    const drawerOptions = [...(screen.getByLabelText('Folder') as HTMLSelectElement).options].map(
      (option) => option.textContent?.trim(),
    );
    expect(drawerOptions).toEqual(['Uncategorized', 'Root', '— Child']);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    fireEvent.change(screen.getByLabelText('Parent folder'), { target: { value: 'root' } });
    fireEvent.change(screen.getByLabelText('New folder name'), {
      target: { value: 'Grandchild' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create folder' }));
    await waitFor(() =>
      expect(vi.mocked(createMediaFolder)).toHaveBeenCalledWith('Grandchild', 'root'),
    );

    // Selecting the child shows the move control; its own subtree is excluded.
    fireEvent.change(filter, { target: { value: 'child' } });
    const moveSelect = (await screen.findByLabelText('Move folder to')) as HTMLSelectElement;
    expect([...moveSelect.options].map((option) => option.value)).toEqual(['', 'root']);
    fireEvent.change(moveSelect, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move folder' }));
    await waitFor(() => expect(vi.mocked(moveMediaFolder)).toHaveBeenCalledWith('child', null));
    expect(await screen.findByText('Folder moved.')).toBeDefined();
  });
  it('manages folders from the visible tree panel', async () => {
    const root = {
      id: 'root',
      name: 'Root',
      parentId: null,
      itemCount: 2,
      createdAt: '2026-11-06T10:00:00.000Z',
      updatedAt: '2026-11-06T10:00:00.000Z',
    };
    const child = {
      id: 'child',
      name: 'Child',
      parentId: 'root',
      itemCount: 1,
      createdAt: '2026-11-06T10:00:00.000Z',
      updatedAt: '2026-11-06T10:00:00.000Z',
    };
    vi.mocked(listMediaFolders).mockResolvedValue([root, child]);
    vi.mocked(renameMediaFolder).mockResolvedValue({ ...child, name: 'Renamed' });
    vi.mocked(moveMediaFolder).mockResolvedValue({ ...child, parentId: null });
    vi.mocked(createMediaFolder).mockResolvedValue({
      ...child,
      id: 'new',
      name: 'Nested',
      parentId: 'root',
    });
    vi.mocked(deleteMediaFolder).mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<MediaPage user={admin} />);
    await screen.findByRole('button', { name: 'View sunset.png' });
    const tree = await screen.findByLabelText('Folder tree');
    expect(screen.getByText('Manage folders (2)')).toBeDefined();

    const childRow = within(tree).getByText('Child').closest('li')!;
    fireEvent.click(within(childRow).getByRole('button', { name: 'Rename' }));
    fireEvent.change(within(childRow).getByLabelText('New folder name'), {
      target: { value: 'Renamed' },
    });
    fireEvent.click(within(childRow).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(vi.mocked(renameMediaFolder)).toHaveBeenCalledWith('child', 'Renamed'),
    );

    fireEvent.click(within(childRow).getByRole('button', { name: 'Move' }));
    fireEvent.change(screen.getByLabelText('Move folder to'), { target: { value: '' } });
    const moveForm = childRow.querySelector('form')!;
    fireEvent.click(within(moveForm).getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(vi.mocked(moveMediaFolder)).toHaveBeenCalledWith('child', null));

    const rootRow = within(tree).getByText('Root').closest('li')!;
    fireEvent.click(within(rootRow).getByRole('button', { name: 'New subfolder' }));
    fireEvent.change(screen.getByLabelText('New subfolder name'), {
      target: { value: 'Nested' },
    });
    fireEvent.click(within(rootRow).getByRole('button', { name: 'Create folder' }));
    await waitFor(() =>
      expect(vi.mocked(createMediaFolder)).toHaveBeenCalledWith('Nested', 'root'),
    );

    fireEvent.click(within(rootRow).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(vi.mocked(deleteMediaFolder)).toHaveBeenCalledWith('root'));
  });

  it('uploads into the folder currently being browsed', async () => {
    const folder = {
      id: 'f1',
      name: 'Travel',
      parentId: null,
      itemCount: 0,
      createdAt: '2026-11-06T10:00:00.000Z',
      updatedAt: '2026-11-06T10:00:00.000Z',
    };
    vi.mocked(listMediaFolders).mockResolvedValue([folder]);
    render(<MediaPage user={admin} />);
    await screen.findByRole('button', { name: 'View sunset.png' });
    await waitFor(() => expect(vi.mocked(listMediaFolders)).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Filter by folder'), {
      target: { value: 'f1' },
    });
    await waitFor(() =>
      expect(vi.mocked(listMedia)).toHaveBeenLastCalledWith(
        expect.objectContaining({ folder: 'f1' }),
      ),
    );

    chooseFiles(screen.getByLabelText('Upload media files'), [
      new File(['x'], 'inside.png', { type: 'image/png' }),
    ]);
    await waitFor(() =>
      expect(vi.mocked(uploadMedia)).toHaveBeenCalledWith(
        expect.any(File),
        expect.objectContaining({ folderId: 'f1' }),
      ),
    );
  });
});
