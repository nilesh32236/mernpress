import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { actionErrorMessage, editMediaImage, restoreMediaOriginal, type MediaItem } from './api.js';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Operation =
  | { type: 'rotate'; degrees: 90 | -90 | 180 }
  | { type: 'flip'; axis: 'horizontal' | 'vertical' }
  | { type: 'crop'; rect: Rect }
  | { type: 'scale'; width: number; height: number };

const ASPECTS: Array<{ value: string; label: string; ratio: number | null }> = [
  { value: 'free', label: 'Free', ratio: null },
  { value: '1:1', label: '1:1', ratio: 1 },
  { value: '4:3', label: '4:3', ratio: 4 / 3 },
  { value: '3:2', label: '3:2', ratio: 3 / 2 },
  { value: '16:9', label: '16:9', ratio: 16 / 9 },
  { value: '2:3', label: '2:3', ratio: 2 / 3 },
  { value: '3:4', label: '3:4', ratio: 3 / 4 },
  { value: '9:16', label: '9:16', ratio: 9 / 16 },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function applyOperation(source: HTMLCanvasElement, operation: Operation): HTMLCanvasElement {
  const output = document.createElement('canvas');
  const context = output.getContext('2d');
  if (!context) return source;

  if (operation.type === 'rotate') {
    output.width = source.height;
    output.height = source.width;
    context.translate(
      operation.degrees === 90 ? output.width : 0,
      operation.degrees === 90 ? 0 : output.height,
    );
    context.rotate((operation.degrees * Math.PI) / 180);
    context.drawImage(source, 0, 0);
    return output;
  }

  if (operation.type === 'flip') {
    output.width = source.width;
    output.height = source.height;
    if (operation.axis === 'horizontal') {
      context.translate(output.width, 0);
      context.scale(-1, 1);
    } else {
      context.translate(0, output.height);
      context.scale(1, -1);
    }
    context.drawImage(source, 0, 0);
    return output;
  }

  if (operation.type === 'crop') {
    const { x, y, width, height } = operation.rect;
    output.width = Math.max(1, Math.round(width));
    output.height = Math.max(1, Math.round(height));
    context.drawImage(source, -Math.round(x), -Math.round(y));
    return output;
  }

  output.width = Math.max(1, Math.round(operation.width));
  output.height = Math.max(1, Math.round(operation.height));
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, output.width, output.height);
  return output;
}

function renderOperations(image: HTMLImageElement, operations: Operation[]): HTMLCanvasElement {
  const initial = document.createElement('canvas');
  initial.width = image.naturalWidth;
  initial.height = image.naturalHeight;
  const context = initial.getContext('2d');
  if (context) {
    context.drawImage(image, 0, 0);
  }
  return operations.reduce(applyOperation, initial);
}

/**
 * WordPress-style image editor: rotate, flip, crop (drag selection with aspect
 * ratios), scale, undo/redo, save and restore the untouched original. Edits are
 * composed on a canvas and sent to the API only on Save, so Cancel discards
 * everything.
 */
export function MediaImageEditor({
  item,
  onClose,
  onSaved,
}: {
  item: MediaItem;
  onClose: () => void;
  onSaved: (item: MediaItem, reason: 'saved' | 'restored') => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    mode: 'new' | 'move' | 'resize';
    handle?: string;
    startX: number;
    startY: number;
    startRect: Rect;
  } | null>(null);

  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [pointer, setPointer] = useState(0);
  const [dimensions, setDimensions] = useState({
    width: item.width ?? 0,
    height: item.height ?? 0,
  });
  const [cropMode, setCropMode] = useState(false);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [aspect, setAspect] = useState('free');
  const [scaleMode, setScaleMode] = useState(false);
  const [scaleWidth, setScaleWidth] = useState(String(item.width ?? ''));
  const [scaleHeight, setScaleHeight] = useState(String(item.height ?? ''));
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const src = `${item.url}?v=${encodeURIComponent(item.editedAt ?? item.updatedAt)}`;

  useEffect(() => {
    let active = true;
    const next = new Image();
    next.onload = () => {
      if (active) {
        setImage(next);
        setDimensions({ width: next.naturalWidth, height: next.naturalHeight });
      }
    };
    next.onerror = () => {
      if (active) setLoadError('Could not load this image.');
    };
    next.src = src;
    return () => {
      active = false;
    };
  }, [src]);

  useEffect(() => {
    if (!image) return;
    const rendered = renderOperations(image, operations.slice(0, pointer));
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = rendered.width;
    canvas.height = rendered.height;
    const context = canvas.getContext('2d');
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(rendered, 0, 0);
    }
    setDimensions({ width: rendered.width, height: rendered.height });
    setCrop(null);
    setCropMode(false);
    setScaleMode(false);
    // Both modes are invalidated whenever the image state changes.
  }, [image, operations, pointer]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const ratio = ASPECTS.find((entry) => entry.value === aspect)?.ratio ?? null;

  function push(operation: Operation) {
    setOperations((current) => [...current.slice(0, pointer), operation]);
    setPointer((current) => current + 1);
  }

  function undo() {
    setPointer((current) => Math.max(0, current - 1));
  }

  function redo() {
    setPointer((current) => Math.min(operations.length, current + 1));
  }

  function fitAspect(rect: Rect, targetRatio: number | null): Rect {
    if (!targetRatio) return rect;
    let width = rect.width;
    let height = width / targetRatio;
    if (height > dimensions.height) {
      height = dimensions.height;
      width = height * targetRatio;
    }
    if (width > dimensions.width) {
      width = dimensions.width;
      height = width / targetRatio;
    }
    return {
      x: clamp(rect.x, 0, dimensions.width - width),
      y: clamp(rect.y, 0, dimensions.height - height),
      width,
      height,
    };
  }

  function startCrop() {
    const width = dimensions.width * 0.8;
    const height = dimensions.height * 0.8;
    const rect = fitAspect(
      {
        x: (dimensions.width - width) / 2,
        y: (dimensions.height - height) / 2,
        width,
        height,
      },
      ratio,
    );
    setCrop(rect);
    setCropMode(true);
    setScaleMode(false);
  }

  function changeAspect(value: string) {
    setAspect(value);
    const nextRatio = ASPECTS.find((entry) => entry.value === value)?.ratio ?? null;
    if (crop) setCrop(fitAspect(crop, nextRatio));
  }

  function toNatural(event: ReactPointerEvent): { x: number; y: number } {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * canvas.width, 0, canvas.width),
      y: clamp(((event.clientY - rect.top) / rect.height) * canvas.height, 0, canvas.height),
    };
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!cropMode || !crop) return;
    event.preventDefault();
    const point = toNatural(event);
    const target = event.target as HTMLElement;
    const handle = target.dataset['handle'];
    const inside =
      point.x >= crop.x &&
      point.x <= crop.x + crop.width &&
      point.y >= crop.y &&
      point.y <= crop.y + crop.height;

    dragRef.current = {
      mode: handle ? 'resize' : inside ? 'move' : 'new',
      ...(handle ? { handle } : {}),
      startX: point.x,
      startY: point.y,
      startRect: crop,
    };
    overlayRef.current?.setPointerCapture(event.pointerId);
    if (dragRef.current.mode === 'new') {
      setCrop({ x: point.x, y: point.y, width: 0, height: 0 });
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    event.preventDefault();
    const point = toNatural(event);
    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;
    const start = drag.startRect;

    if (drag.mode === 'move') {
      setCrop({
        ...start,
        x: clamp(start.x + dx, 0, dimensions.width - start.width),
        y: clamp(start.y + dy, 0, dimensions.height - start.height),
      });
      return;
    }

    if (drag.mode === 'new') {
      const rect = {
        x: Math.min(drag.startX, point.x),
        y: Math.min(drag.startY, point.y),
        width: Math.abs(point.x - drag.startX),
        height: Math.abs(point.y - drag.startY),
      };
      setCrop(fitAspect(rect, ratio));
      return;
    }

    if (drag.mode === 'resize' && drag.handle) {
      const right = start.x + start.width;
      const bottom = start.y + start.height;
      let x = start.x;
      let y = start.y;
      let width: number;
      let height: number;
      if (drag.handle.includes('w')) {
        x = clamp(point.x, 0, right - 20);
        width = right - x;
      } else {
        width = clamp(point.x - start.x, 20, dimensions.width - start.x);
      }
      if (drag.handle.includes('n')) {
        y = clamp(point.y, 0, bottom - 20);
        height = bottom - y;
      } else {
        height = clamp(point.y - start.y, 20, dimensions.height - start.y);
      }
      setCrop(fitAspect({ x, y, width, height }, ratio));
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    overlayRef.current?.releasePointerCapture?.(event.pointerId);
  }

  function applyCrop() {
    if (!crop || crop.width < 2 || crop.height < 2) return;
    push({
      type: 'crop',
      rect: {
        x: Math.round(crop.x),
        y: Math.round(crop.y),
        width: Math.round(crop.width),
        height: Math.round(crop.height),
      },
    });
    setCrop(null);
    setCropMode(false);
  }

  function startScale() {
    setScaleWidth(String(dimensions.width));
    setScaleHeight(String(dimensions.height));
    setScaleMode(true);
    setCropMode(false);
    setCrop(null);
  }

  function applyScale() {
    const width = Math.round(Number(scaleWidth));
    const height = Math.round(Number(scaleHeight));
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
      setError('Enter a width and height of at least 1 pixel.');
      return;
    }
    if (width > 2560 || height > 2560) {
      setError('The longest side cannot exceed 2560 pixels.');
      return;
    }
    setError(null);
    push({ type: 'scale', width, height });
    setScaleMode(false);
  }

  function save() {
    const canvas = canvasRef.current;
    if (!canvas || saving || cropMode || scaleMode || pointer === 0) return;
    setSaving(true);
    setError(null);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setSaving(false);
          setError('Could not prepare the edited image.');
          return;
        }
        void editMediaImage(item.id, blob)
          .then((updated) => {
            onSaved(updated, 'saved');
          })
          .catch((caught) => {
            setError(actionErrorMessage(caught));
          })
          .finally(() => setSaving(false));
      },
      'image/webp',
      0.92,
    );
  }

  async function restore() {
    if (restoring || saving) return;
    if (!window.confirm('Restore the original image? All saved edits will be discarded.')) {
      return;
    }
    setRestoring(true);
    setError(null);
    try {
      const updated = await restoreMediaOriginal(item.id);
      onSaved(updated, 'restored');
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="media-editor-overlay" role="dialog" aria-modal="true" aria-label="Edit image">
      <div className="media-editor">
        <header className="media-editor-header">
          <h2>Edit Image</h2>
          <span className="media-editor-dimensions">
            {dimensions.width} × {dimensions.height}
          </span>
          <div className="media-editor-header-actions">
            {item.hasOriginal ? (
              <button
                type="button"
                className="button-link"
                onClick={() => void restore()}
                disabled={saving || restoring}
              >
                {restoring ? 'Restoring…' : 'Restore original image'}
              </button>
            ) : null}
            <button
              type="button"
              className="button primary-button"
              onClick={save}
              disabled={saving || pointer === 0 || cropMode || scaleMode}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="button secondary-button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </header>

        {error ? (
          <p className="form-error media-editor-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="media-editor-toolbar" role="toolbar" aria-label="Image edit tools">
          <button
            type="button"
            className="media-editor-tool"
            onClick={() => push({ type: 'rotate', degrees: -90 })}
            aria-label="Rotate left"
            title="Rotate left"
          >
            <span className="dashicons dashicons-image-rotate-left" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="media-editor-tool"
            onClick={() => push({ type: 'rotate', degrees: 90 })}
            aria-label="Rotate right"
            title="Rotate right"
          >
            <span className="dashicons dashicons-image-rotate-right" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="media-editor-tool"
            onClick={() => push({ type: 'rotate', degrees: 180 })}
            aria-label="Rotate 180°"
            title="Rotate 180°"
          >
            <span className="dashicons dashicons-image-rotate" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="media-editor-tool"
            onClick={() => push({ type: 'flip', axis: 'vertical' })}
            aria-label="Flip vertical"
            title="Flip vertical"
          >
            <span className="dashicons dashicons-image-flip-vertical" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="media-editor-tool"
            onClick={() => push({ type: 'flip', axis: 'horizontal' })}
            aria-label="Flip horizontal"
            title="Flip horizontal"
          >
            <span className="dashicons dashicons-image-flip-horizontal" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="media-editor-tool"
            onClick={undo}
            disabled={pointer === 0}
            aria-label="Undo"
            title="Undo"
          >
            <span className="dashicons dashicons-undo" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="media-editor-tool"
            onClick={redo}
            disabled={pointer >= operations.length}
            aria-label="Redo"
            title="Redo"
          >
            <span className="dashicons dashicons-redo" aria-hidden="true" />
          </button>
          <span className="media-editor-separator" aria-hidden="true" />
          <button
            type="button"
            className={`media-editor-tool${cropMode ? ' is-active' : ''}`}
            onClick={startCrop}
            aria-label="Crop"
            aria-pressed={cropMode}
            title="Crop"
          >
            <span className="dashicons dashicons-image-crop" aria-hidden="true" />
          </button>
          <select
            className="media-editor-aspect"
            aria-label="Aspect ratio"
            value={aspect}
            onChange={(event) => changeAspect(event.target.value)}
            disabled={!cropMode}
          >
            {ASPECTS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="media-editor-text-tool"
            onClick={startScale}
            aria-pressed={scaleMode}
          >
            Scale
          </button>
        </div>

        {cropMode ? (
          <div className="media-editor-crop-bar">
            <span>Drag to select the crop area.</span>
            <button type="button" className="button primary-button" onClick={applyCrop}>
              Apply Crop
            </button>
            <button
              type="button"
              className="button secondary-button"
              onClick={() => {
                setCropMode(false);
                setCrop(null);
              }}
            >
              Cancel Crop
            </button>
          </div>
        ) : null}

        {scaleMode ? (
          <div className="media-editor-scale-bar">
            <label>
              Width
              <input
                type="number"
                min={1}
                max={2560}
                value={scaleWidth}
                onChange={(event) => setScaleWidth(event.target.value)}
              />
            </label>
            <label>
              Height
              <input
                type="number"
                min={1}
                max={2560}
                value={scaleHeight}
                onChange={(event) => setScaleHeight(event.target.value)}
              />
            </label>
            <button type="button" className="button primary-button" onClick={applyScale}>
              Apply Scale
            </button>
            <button
              type="button"
              className="button secondary-button"
              onClick={() => setScaleMode(false)}
            >
              Cancel
            </button>
          </div>
        ) : null}

        <div className="media-editor-stage">
          {loadError ? (
            <p className="form-error">{loadError}</p>
          ) : !image ? (
            <p className="field-help">Loading image…</p>
          ) : null}
          <div
            className="media-editor-canvas-wrap"
            ref={overlayRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <canvas ref={canvasRef} className="media-editor-canvas" />
            {cropMode && crop ? (
              <div
                className="media-editor-crop-selection"
                style={{
                  left: `${(crop.x / dimensions.width) * 100}%`,
                  top: `${(crop.y / dimensions.height) * 100}%`,
                  width: `${(crop.width / dimensions.width) * 100}%`,
                  height: `${(crop.height / dimensions.height) * 100}%`,
                }}
              >
                {(['nw', 'ne', 'sw', 'se'] as const).map((handle) => (
                  <span
                    key={handle}
                    className={`media-editor-crop-handle is-${handle}`}
                    data-handle={handle}
                    aria-hidden="true"
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
