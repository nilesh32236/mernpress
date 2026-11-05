import { forwardRef, useImperativeHandle, useState, type ReactNode } from 'react';

/**
 * Test double for the lazily-loaded Gutenberg canvas. Unit tests exercise the
 * document workflow (dirty tracking, saves, conflicts, terms, publishing)
 * without booting the 6 MB WordPress bundle; the real canvas is covered by the
 * browser smoke test.
 */
export interface MockCanvasProps {
  initialContent: string;
  onChange: (content: string) => void;
  onDirty?: () => void;
  titleSlot?: ReactNode;
}

export interface MockCanvasHandle {
  flush: () => string;
}

export const BlockCanvasMock = forwardRef<MockCanvasHandle, MockCanvasProps>(
  function BlockCanvasMock({ initialContent, onChange, onDirty, titleSlot }, ref) {
    const [value, setValue] = useState(initialContent);

    useImperativeHandle(ref, () => ({
      flush: () => {
        onChange(value);
        return value;
      },
      getSelectedBlockInfo: () => null,
    }));

    return (
      <div data-testid="mock-block-canvas">
        {titleSlot}
        <label htmlFor="mock-content">Content</label>
        <textarea
          id="mock-content"
          value={value}
          onChange={(event) => {
            const next = event.target.value;
            setValue(next);
            onDirty?.();
            onChange(next);
          }}
        />
      </div>
    );
  },
);
