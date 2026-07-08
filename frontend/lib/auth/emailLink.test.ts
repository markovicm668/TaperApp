import test from 'node:test';
import assert from 'node:assert/strict';
import { stripEmailLinkParams } from './emailLink.ts';

test('stripEmailLinkParams removes Firebase action params', () => {
  const href =
    'http://localhost:3000/login?apiKey=abc&mode=signIn&oobCode=XYZ&continueUrl=http%3A%2F%2Flocalhost%3A3000%2Flogin&lang=en';
  assert.equal(stripEmailLinkParams(href), '/login');
});

test('stripEmailLinkParams preserves other params and the hash', () => {
  const href =
    'https://example.com/login?oobCode=XYZ&ref=abc123&mode=signIn#section';
  assert.equal(stripEmailLinkParams(href), '/login?ref=abc123#section');
});

test('stripEmailLinkParams leaves URLs without action params untouched', () => {
  const href = 'https://example.com/login?ref=abc123';
  assert.equal(stripEmailLinkParams(href), '/login?ref=abc123');
});

test('stripEmailLinkParams returns invalid URLs unchanged', () => {
  assert.equal(stripEmailLinkParams('not-a-url'), 'not-a-url');
});
