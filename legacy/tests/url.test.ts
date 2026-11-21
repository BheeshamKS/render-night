import { toFileUrl } from '../src/renderer/utils/url';

import { describe, expect, it } from 'vitest';

describe('toFileUrl', () => {
  it('converts Windows backslash paths to standard file:/// URLs', () => {
    const winPath = 'C:\\renders\\shot_0001.png';
    const url = toFileUrl(winPath);
    expect(url).toBe('file:///C:/renders/shot_0001.png');
  });

  it('escapes spaces and hashes in Windows paths', () => {
    const winPath = 'D:\\My Projects\\Render Output\\shot_#0042.png';
    const url = toFileUrl(winPath);
    expect(url).toBe('file:///D:/My%20Projects/Render%20Output/shot_%230042.png');
  });

  it('converts POSIX Linux / macOS paths correctly', () => {
    const posixPath = '/home/user/renders/shot_0001.png';
    const url = toFileUrl(posixPath);
    expect(url).toBe('file:///home/user/renders/shot_0001.png');
  });

  it('escapes question marks and hashes in POSIX paths', () => {
    const posixPath = '/tmp/render/frame_#12?version=1.png';
    const url = toFileUrl(posixPath);
    expect(url).toBe('file:///tmp/render/frame_%2312%3Fversion=1.png');
  });

  it('returns empty string for empty or null inputs', () => {
    expect(toFileUrl('')).toBe('');
    expect(toFileUrl(null as unknown as string)).toBe('');
    expect(toFileUrl(undefined as unknown as string)).toBe('');
  });
});
