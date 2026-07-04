import { describe, it, expect } from 'vitest';
import { classifyHost } from '../src/main/security/blocklist';

describe('classifyHost', () => {
  it('erkennt Werbe-Hosts (inkl. Subdomains)', () => {
    expect(classifyHost('doubleclick.net')).toBe('ad');
    expect(classifyHost('ads.doubleclick.net')).toBe('ad');
  });

  it('erkennt Tracker-Hosts', () => {
    expect(classifyHost('google-analytics.com')).toBe('tracker');
    expect(classifyHost('www.google-analytics.com')).toBe('tracker');
  });

  it('lässt neutrale Hosts durch', () => {
    expect(classifyHost('example.org')).toBeNull();
    expect(classifyHost('wikipedia.org')).toBeNull();
  });

  it('matcht nicht auf Teilstrings ohne Domain-Grenze', () => {
    // 'notdoubleclick.net' darf nicht als doubleclick.net durchgehen
    expect(classifyHost('notdoubleclick.net')).toBeNull();
  });
});
