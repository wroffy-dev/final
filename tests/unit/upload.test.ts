import { describe, it, expect } from 'vitest';
import {
  validateUpload,
  buildStorageKey,
  readImageDimensions,
  maxUploadBytes,
} from '@/lib/services/upload';
import {
  DEFAULT_MAX_UPLOAD_KB,
  tooLargeMessage,
  UNSUPPORTED_TYPE_MESSAGE,
  ALLOWED_MIME_TYPES,
  ACCEPT_ATTRIBUTE,
} from '@/lib/media/constants';

/** 150 KB, the ceiling this installation enforces. */
const LIMIT = DEFAULT_MAX_UPLOAD_KB * 1024;

const PNG_HEADER = Buffer.from([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a, // signature
  0x00,
  0x00,
  0x00,
  0x0d,
  0x49,
  0x48,
  0x44,
  0x52, // IHDR chunk
  0x00,
  0x00,
  0x03,
  0x20, // width  = 800
  0x00,
  0x00,
  0x02,
  0x58, // height = 600
  0x08,
  0x06,
  0x00,
  0x00,
  0x00,
]);

const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

describe('validateUpload', () => {
  it('accepts a PNG whose bytes match its declared type', () => {
    const result = validateUpload('image/png', PNG_HEADER, PNG_HEADER.byteLength);
    expect(result.ok).toBe(true);
    expect(result.ok && result.kind).toBe('IMAGE');
    expect(result.ok && result.extension).toBe('png');
  });

  it('rejects a disallowed MIME type with the allow-list message', () => {
    const result = validateUpload('application/x-msdownload', PNG_HEADER, PNG_HEADER.byteLength);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe(UNSUPPORTED_TYPE_MESSAGE);
    // The attacker-controlled type is never echoed back into the UI.
    expect(result.ok === false && result.error).not.toContain('x-msdownload');
  });

  it('rejects every format that was removed from the allow-list', () => {
    for (const mime of [
      'image/avif',
      'video/mp4',
      'video/webm',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/csv',
    ]) {
      const result = validateUpload(mime, PNG_HEADER, PNG_HEADER.byteLength);
      expect(result.ok, `${mime} must be rejected`).toBe(false);
      expect(result.ok === false && result.error).toBe(UNSUPPORTED_TYPE_MESSAGE);
    }
  });

  it('rejects a file whose bytes contradict its declared type', () => {
    // Claims to be a PNG, actually carries a JPEG signature.
    const result = validateUpload('image/png', JPEG_HEADER, JPEG_HEADER.byteLength);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/do not match/i);
  });

  it('rejects an empty file', () => {
    expect(validateUpload('image/png', Buffer.alloc(0), 0).ok).toBe(false);
  });

  it('enforces 150 KB exactly, at the boundary', () => {
    // Pinned to the built-in default rather than the ambient environment:
    // .env.example ships MAX_UPLOAD_SIZE_MB, so a developer who copied it
    // would otherwise see this fail for a perfectly valid local setup.
    withUploadEnv({ MAX_UPLOAD_KB: undefined, MAX_UPLOAD_SIZE_MB: undefined }, () => {
      expect(maxUploadBytes()).toBe(LIMIT);

      // Exactly at the limit is accepted…
      expect(validateUpload('image/png', PNG_HEADER, LIMIT).ok).toBe(true);
      // …one byte over is not.
      const over = validateUpload('image/png', PNG_HEADER, LIMIT + 1);
      expect(over.ok).toBe(false);
      expect(over.ok === false && over.error).toBe(tooLargeMessage(LIMIT));
    });
  });

  it('falls back to 150 KB when the environment is missing or nonsense', () => {
    withUploadEnv({}, () => {
      for (const value of [undefined, '', 'abc', '0', '-5']) {
        withUploadEnv({ MAX_UPLOAD_KB: value, MAX_UPLOAD_SIZE_MB: undefined }, () => {
          expect(maxUploadBytes(), `MAX_UPLOAD_KB=${value}`).toBe(LIMIT);
        });
        withUploadEnv({ MAX_UPLOAD_SIZE_MB: value, MAX_UPLOAD_KB: undefined }, () => {
          expect(maxUploadBytes(), `MAX_UPLOAD_SIZE_MB=${value}`).toBe(LIMIT);
        });
      }
    });
  });

  it('reads MAX_UPLOAD_SIZE_MB, and prefers it over the kilobyte name', () => {
    withUploadEnv({ MAX_UPLOAD_SIZE_MB: '10', MAX_UPLOAD_KB: undefined }, () => {
      expect(maxUploadBytes()).toBe(10 * 1024 * 1024);
      expect(tooLargeMessage(maxUploadBytes())).toBe('File size must be 10 MB or less.');
    });

    // Both set: the megabyte name wins, so a deployment that adds the new one
    // is not silently held at the old limit.
    withUploadEnv({ MAX_UPLOAD_SIZE_MB: '5', MAX_UPLOAD_KB: '150' }, () => {
      expect(maxUploadBytes()).toBe(5 * 1024 * 1024);
    });

    // Only the legacy name: an existing deployment keeps its limit.
    withUploadEnv({ MAX_UPLOAD_SIZE_MB: undefined, MAX_UPLOAD_KB: '512' }, () => {
      expect(maxUploadBytes()).toBe(512 * 1024);
    });
  });

  it('accepts every allowed type and nothing else', () => {
    const samples: Record<string, Buffer> = {
      'image/jpeg': JPEG_HEADER,
      'image/png': PNG_HEADER,
      'image/webp': Buffer.concat([
        Buffer.from('RIFF'),
        Buffer.alloc(4),
        Buffer.from('WEBPVP8 '),
        Buffer.alloc(20),
      ]),
      'image/gif': Buffer.from('GIF89a' + '\0'.repeat(10)),
      'image/svg+xml': Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      'application/pdf': Buffer.from('%PDF-1.7\n'),
    };

    for (const mime of ALLOWED_MIME_TYPES) {
      const buffer = samples[mime];
      expect(buffer, `no sample for ${mime}`).toBeTruthy();
      expect(validateUpload(mime, buffer, buffer.byteLength).ok, mime).toBe(true);
    }
  });

  it('offers the browser exactly the formats the server accepts', () => {
    for (const mime of ALLOWED_MIME_TYPES) expect(ACCEPT_ATTRIBUTE).toContain(mime);
    for (const ext of ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.pdf']) {
      expect(ACCEPT_ATTRIBUTE).toContain(ext);
    }
    for (const gone of ['image/avif', 'video/mp4', '.docx', '.csv']) {
      expect(ACCEPT_ATTRIBUTE).not.toContain(gone);
    }
  });

  it('rejects an SVG containing script', () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    const result = validateUpload('image/svg+xml', svg, svg.byteLength);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/script/i);
  });

  it('accepts a plain SVG', () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
    );
    expect(validateUpload('image/svg+xml', svg, svg.byteLength).ok).toBe(true);
  });

  it('rejects the ways an SVG can smuggle script past a naive check', () => {
    const hostile = [
      // Split across an XML comment.
      '<svg xmlns="http://www.w3.org/2000/svg"><scr<!-- x -->ipt>alert(1)</script></svg>',
      // Newline inside the scheme.
      '<svg xmlns="http://www.w3.org/2000/svg"><a href="java\nscript:alert(1)">x</a></svg>',
      // Event handler rather than a script element.
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="alert(1)"/></svg>',
      // Embedded HTML and frames.
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body/></foreignObject></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><iframe src="x"></iframe></svg>',
      // External fetch and entity expansion.
      '<svg xmlns="http://www.w3.org/2000/svg"><use href="https://evil.test/x#y"/></svg>',
      '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"/>',
      // data: URL carrying markup.
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:text/html,<script>1</script>"/></svg>',
    ];

    for (const source of hostile) {
      const buffer = Buffer.from(source);
      const result = validateUpload('image/svg+xml', buffer, buffer.byteLength);
      expect(result.ok, `must reject: ${source.slice(0, 60)}`).toBe(false);
    }
  });

  it('does not let padding push script past the inspected window', () => {
    // The old check only read the first 4 KB, so padding hid the payload.
    const padded =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<!--' +
      'A'.repeat(8192) +
      '-->' +
      '<script>alert(1)</script></svg>';
    const buffer = Buffer.from(padded);
    expect(validateUpload('image/svg+xml', buffer, buffer.byteLength).ok).toBe(false);
  });

  it('rejects a non-SVG wearing the SVG type', () => {
    const buffer = Buffer.from('just some text');
    const result = validateUpload('image/svg+xml', buffer, buffer.byteLength);
    expect(result.ok).toBe(false);
  });
});

describe('buildStorageKey', () => {
  it('namespaces by year and month and adds entropy', () => {
    const key = buildStorageKey('My Photo.PNG', 'png');
    expect(key).toMatch(/^\d{4}\/\d{2}\/my-photo-[0-9a-f]{12}\.png$/);
  });

  it('strips path traversal from the filename', () => {
    const key = buildStorageKey('../../etc/passwd', 'png');
    expect(key).not.toContain('..');
    expect(key).not.toContain('etc/passwd');
  });

  it('falls back to a default name when nothing usable remains', () => {
    expect(buildStorageKey('!!!.png', 'png')).toMatch(/file-[0-9a-f]{12}\.png$/);
  });
});

describe('readImageDimensions', () => {
  it('reads PNG dimensions from the header', () => {
    expect(readImageDimensions(PNG_HEADER, 'image/png')).toEqual({ width: 800, height: 600 });
  });

  it('returns null for a format it cannot parse', () => {
    expect(readImageDimensions(Buffer.from('not an image'), 'application/pdf')).toBeNull();
  });
});

/** Runs `body` with the upload-size variables set, then restores them. */
function withUploadEnv(
  values: Partial<Record<'MAX_UPLOAD_KB' | 'MAX_UPLOAD_SIZE_MB', string | undefined>>,
  body: () => void,
): void {
  const names = ['MAX_UPLOAD_KB', 'MAX_UPLOAD_SIZE_MB'] as const;
  const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) {
      const value = name in values ? values[name] : original[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    body();
  } finally {
    for (const name of names) {
      const value = original[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}
