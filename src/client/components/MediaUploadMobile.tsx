import { useRef, useState, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Camera, Check, X, Loader2, FileCheck } from 'lucide-react';
import { useCommandRunner } from './useCommandRunner';

interface UploadResult {
  fileId: string;
  filePath: string;
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  thumbnailPath?: string;
  mediumPath?: string;
  previewUrl?: string;
}

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

interface MediaUploadMobileProps {
  batchId: string;
}

export function MediaUploadMobile({ batchId }: MediaUploadMobileProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState<UploadResult | null>(null);
  const { runCommand } = useCommandRunner();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (xhrRef.current && typeof xhrRef.current.abort === 'function') {
        xhrRef.current.abort();
        xhrRef.current = null;
      }
    };
  }, []);

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setStatus('uploading');
      setProgress(0);
      setErrorMessage('');
      setResult(null);

      const formData = new FormData();
      formData.append('batchId', batchId);
      formData.append('file', file);

      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;

      xhr.upload.onprogress = (event) => {
        if (!mountedRef.current) return;
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setProgress(percent);
        }
      };

      xhr.onload = async () => {
        if (!mountedRef.current) return;
        if (xhr.status === 200) {
          let data: UploadResult | undefined;
          try {
            data = JSON.parse(xhr.responseText) as UploadResult;
            const mediaType = data.mimeType.startsWith('video/') ? 'video' : 'photo';
            const commandResult = await runCommand('uploadBatchMedia', {
              batchId,
              fileId: data.fileId,
              filePath: data.filePath,
              originalFilename: data.originalFilename,
              fileSize: data.fileSize,
              mimeType: data.mimeType,
              mediaType,
              thumbnailPath: data.thumbnailPath,
              mediumPath: data.mediumPath,
              isPrimary: false
            });
            if (!mountedRef.current) return;
            const mediaId = commandResult.affectedIds?.[0];
            setResult({
              ...data,
              previewUrl: mediaId ? `/api/media/${mediaId}/thumb` : undefined
            });
            setStatus('success');
          } catch {
            if (!mountedRef.current) return;
            // Best-effort cleanup of orphaned staged files
            if (data) {
              try {
                await fetch('/api/upload/media/staged', {
                  method: 'DELETE',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    filePath: data.filePath,
                    thumbnailPath: data.thumbnailPath,
                    mediumPath: data.mediumPath
                  })
                });
              } catch {
                // ignore cleanup failures
              }
            }
            if (!mountedRef.current) return;
            setStatus('error');
            setErrorMessage('Upload failed. Please try again.');
          }
        } else if (xhr.status === 401 || xhr.status === 403) {
          setStatus('error');
          setErrorMessage('Authentication failed. Please sign in again.');
        } else if (xhr.status === 507) {
          setStatus('error');
          setErrorMessage('Server storage full. Contact administrator.');
        } else if (xhr.status === 400) {
          try {
            const data = JSON.parse(xhr.responseText) as { error?: string };
            const msg = data.error ?? '';
            if (msg.includes('File type')) {
              setStatus('error');
              setErrorMessage('File type not allowed.');
            } else if (msg.includes('size')) {
              setStatus('error');
              setErrorMessage('File exceeds size limit.');
            } else {
              setStatus('error');
              setErrorMessage(msg || 'Upload failed. Please try again.');
            }
          } catch {
            setStatus('error');
            setErrorMessage('Upload failed. Please try again.');
          }
        } else {
          setStatus('error');
          setErrorMessage('Upload failed. Please try again.');
        }
      };

      xhr.onerror = () => {
        if (!mountedRef.current) return;
        setStatus('error');
        setErrorMessage('Upload failed. Check connection and try again.');
      };

      xhr.onabort = () => {
        if (!mountedRef.current) return;
        setStatus('idle');
        setProgress(0);
      };

      xhr.open('POST', '/api/upload/media');
      xhr.send(formData);

      // Reset file input so the same file can be selected again
      event.target.value = '';
    },
    [batchId, runCommand]
  );

  function handleCancel() {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
    setStatus('idle');
    setProgress(0);
  }

  function handleTrigger() {
    fileInputRef.current?.click();
  }

  return (
    <div className="border border-line bg-white p-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="sr-only"
        onChange={handleFileSelect}
      />

      {status === 'idle' && (
        <button
          type="button"
          onClick={handleTrigger}
          className="primary-button w-full justify-center"
        >
          <Camera className="h-4 w-4" aria-hidden="true" />
          Take Photo/Video
        </button>
      )}

      {status === 'uploading' && (
        <div className="grid gap-2">
          <div className="flex items-center gap-2 text-sm text-zinc-700">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>Uploading… {progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden bg-zinc-200">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="secondary-button compact-action self-start"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Cancel
          </button>
        </div>
      )}

      {status === 'success' && result && (
        <div className="grid gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            <Check className="h-4 w-4" aria-hidden="true" />
            <span>Upload complete</span>
          </div>
          {result.mimeType.startsWith('image/') && result.previewUrl ? (
            <img
              src={result.previewUrl}
              alt={result.originalFilename}
              className="h-24 w-24 border border-line object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex items-center gap-2 text-sm text-zinc-700">
              <FileCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              <span className="truncate">{result.originalFilename}</span>
            </div>
          )}
          <button
            type="button"
            onClick={handleTrigger}
            className="secondary-button compact-action self-start"
          >
            <Camera className="h-3.5 w-3.5" aria-hidden="true" />
            Upload another
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="grid gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-red-700">
            <X className="h-4 w-4" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={handleTrigger}
            className="secondary-button compact-action self-start"
          >
            <Camera className="h-3.5 w-3.5" aria-hidden="true" />
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

export function MediaUploadMobileRoute() {
  const { batchId } = useParams<{ batchId: string }>();
  if (!batchId) {
    return <div>Batch id is required.</div>;
  }
  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold mb-4">Mobile Media Upload</h1>
      <MediaUploadMobile batchId={batchId} />
    </div>
  );
}
