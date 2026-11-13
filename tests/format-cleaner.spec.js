// @ts-check
import { test, expect } from '@playwright/test';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Dispatch a synthetic paste event carrying HTML and/or plain-text content. */
async function paste(page, { html = '', plain = '' } = {}) {
  await page.evaluate(({ html, plain }) => {
    const dt = new DataTransfer();
    if (html)  dt.setData('text/html',  html);
    if (plain) dt.setData('text/plain', plain);
    const editor = document.getElementById('mcguffin');
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, { html, plain });
}

/** Dispatch a synthetic paste event that carries an image item. */
async function pasteImage(page) {
  await page.evaluate(() => {
    const dt = new DataTransfer();
    // DataTransfer won't accept a real Blob via setData for image/png;
    // instead we stub clipboardData.items to include an image-type entry.
    const editor = document.getElementById('mcguffin');
    const fakeEvent = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(fakeEvent, 'clipboardData', {
      value: {
        items: [{ type: 'image/png' }],
        getData: () => '',
      },
    });
    editor.dispatchEvent(fakeEvent);
  });
}

/** Read the current text content of the editor. */
async function editorText(page) {
  return page.locator('#mcguffin').textContent();
}

/** Read the current prompt/message text. */
async function promptText(page) {
  return page.locator('#formatting-message').textContent();
}

// ─── page load ──────────────────────────────────────────────────────────────

test.describe('page structure', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('nav shows the tagline and no site name', async ({ page }) => {
    await expect(page.locator('nav')).not.toContainText('Copy Clean');
  });

  test('window title is "Paste Without Formatting", in the selected language', async ({ page }) => {
    await expect(page).toHaveTitle('Paste Without Formatting');
    await page.locator('#language-selector').selectOption('fr');
    await expect(page).toHaveTitle('Coller sans mise en forme');
  });

  test('tagline says "Copy formatted text. Paste it clean."', async ({ page }) => {
    await expect(page.locator('#tagline')).toContainText('Copy formatted text. Paste it clean.');
  });

  test('how-it-works table shows when empty and hides once text is cleaned', async ({ page }) => {
    await expect(page.locator('.howto')).toBeVisible();
    await expect(page.locator('.howto tr')).toHaveCount(3);
    await paste(page, { plain: 'some text' });
    await expect(page.locator('.howto')).toBeHidden();
  });

  test('editor is focused on load', async ({ page }) => {
    const focused = await page.evaluate(() => document.activeElement?.id);
    expect(focused).toBe('mcguffin');
  });

  test('there is no visible character counter', async ({ page }) => {
    await expect(page.locator('#counter')).toBeHidden();
  });

  test('markdown toggle button is hidden', async ({ page }) => {
    await expect(page.locator('#convert-to-markdown')).toBeHidden();
  });

  test('the markdown help panel and its toggle are hidden', async ({ page }) => {
    await expect(page.locator('#toggle-help')).toBeHidden();
    await expect(page.locator('#markdown-help')).toBeHidden();
  });

  test('markdown preview area is hidden', async ({ page }) => {
    await expect(page.locator('#markdown-preview')).toBeHidden();
  });
});


// ─── manual paste ────────────────────────────────────────────────────────────

test.describe('manual paste', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test.beforeEach(async ({ page }) => {
    // Navigate first to get clipboard access, wipe it, then reload so
    // initializeClipboardOnLoad fires against an empty clipboard.
    await page.goto('/');
    await page.evaluate(() => navigator.clipboard.writeText(''));
    await page.reload();
  });

  test('strips HTML tags, leaves plain text', async ({ page }) => {
    await paste(page, { html: '<b>Bold</b> and <em>italic</em>', plain: 'Bold and italic' });
    const text = await editorText(page);
    expect(text).toBe('Bold and italic');
    expect(text).not.toContain('<');
  });

  test('handles deeply nested HTML', async ({ page }) => {
    await paste(page, { html: '<div><ul><li><b>Item</b></li></ul></div>', plain: 'Item' });
    const text = await editorText(page);
    expect(text).not.toContain('<');
  });

  test('passes plain text through unchanged', async ({ page }) => {
    await paste(page, { plain: 'just plain text' });
    const text = await editorText(page);
    expect(text).toBe('just plain text');
  });

  test('ignores empty paste', async ({ page }) => {
    await paste(page, { plain: '' });
    const text = await editorText(page);
    expect(text?.trim()).toBe('');
  });

  test('replaces existing content on paste', async ({ page }) => {
    await paste(page, { plain: 'first paste' });
    await paste(page, { plain: 'second paste' });
    const text = await editorText(page);
    expect(text).toBe('second paste');
  });

  test('shows "cleaned & copied" once the clipboard write succeeds', async ({ page }) => {
    await page.evaluate(() => {
      navigator.clipboard.writeText = () => Promise.resolve();
    });
    await paste(page, { plain: 'some text' });
    await expect(page.locator('#formatting-message')).toHaveText(/cleaned & copied/i);
  });

  test('reports failure and selects the text when the clipboard write is denied', async ({ page }) => {
    await page.evaluate(() => {
      navigator.clipboard.writeText = () => Promise.reject(new Error('denied'));
    });
    await paste(page, { plain: 'some text' });
    await expect(page.locator('#formatting-message')).toHaveText(/ctrl\/cmd\+c/i);
    const selected = await page.evaluate(() => window.getSelection().toString());
    expect(selected).toBe('some text');
  });

  test('shows "images not supported" when image is pasted', async ({ page }) => {
    await pasteImage(page);
    const msg = await promptText(page);
    expect(msg).toMatch(/image/i);
  });

  test('editor stays empty after image paste', async ({ page }) => {
    await pasteImage(page);
    const text = await editorText(page);
    expect(text?.trim()).toBe('');
  });

  test('editor retains focus after paste', async ({ page }) => {
    await paste(page, { plain: 'focus test' });
    const focused = await page.evaluate(() => document.activeElement?.id);
    expect(focused).toBe('mcguffin');
  });
});

// ─── newline handling ────────────────────────────────────────────────────────

test.describe('newline handling', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.clipboard.writeText(''));
    await page.reload();
  });

  /** innerText respects <br> as line breaks; textContent does not. */
  async function editorLines(page) {
    return page.locator('#mcguffin').evaluate(el => el.innerText);
  }

  test('<br> produces a newline', async ({ page }) => {
    await paste(page, { html: 'a<br>b' });
    expect(await editorLines(page)).toBe('a\nb');
  });

  test('<p> blocks produce newlines', async ({ page }) => {
    await paste(page, { html: '<p>a</p><p>b</p>' });
    expect(await editorLines(page)).toBe('a\nb');
  });

  test('Chrome contenteditable format: first line inline, rest in <div>', async ({ page }) => {
    await paste(page, { html: 'a<div>b</div><div>c</div>' });
    expect(await editorLines(page)).toBe('a\nb\nc');
  });

  test('plain text newlines are preserved', async ({ page }) => {
    await paste(page, { plain: 'a\nb\nc' });
    expect(await editorLines(page)).toBe('a\nb\nc');
  });

  test('three or more consecutive blank lines collapse to one', async ({ page }) => {
    await paste(page, { html: '<p>a</p><p></p><p></p><p></p><p>b</p>' });
    const text = await editorLines(page);
    expect(text).toBe('a\n\nb');
  });
});

// ─── copy-all button ─────────────────────────────────────────────────────────
// Hidden in Copy Clean mode — paste already copies the cleaned text. Quick Edit shows it.

test.describe('copy-all button hidden', () => {
  test('copy-all button is hidden in Copy Clean mode', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#copy-all')).toBeHidden();
  });
});

// ─── how-it-works step 2 adapts to clipboard access ──────────────────────────

test.describe('how-it-works step 2', () => {
  const step2 = (page) => page.locator('#howto-step2');

  async function stubPermission(page, state) {
    await page.addInitScript((state) => {
      navigator.permissions.query = () =>
        Promise.resolve({ state, addEventListener() {} });
    }, state);
  }

  test('asks for a click when permission is still to be prompted', async ({ page }) => {
    await stubPermission(page, 'prompt');
    await page.goto('/');
    await expect(step2(page)).toHaveText(/paste/i);
    await expect(page.locator('.howto .paste-key')).toBeVisible();
    await expect(page.locator('.howto .url-chip')).toBeHidden();
  });

  test('needs nothing from the user when permission is already granted', async ({ page }) => {
    await stubPermission(page, 'granted');
    await page.goto('/');
    await expect(step2(page)).toHaveText(/Open this page\. Your clipboard is cleaned/i);
    await expect(step2(page)).not.toContainText(/paste/i);
    await expect(page.locator('.howto .url-chip')).toBeVisible();
    await expect(page.locator('.howto .paste-key')).toBeHidden();
  });

  test('falls back to pasting when clipboard access is blocked', async ({ page }) => {
    await stubPermission(page, 'denied');
    await page.goto('/');
    await expect(step2(page)).toHaveText(/blocked/i);
    await expect(page.locator('.howto .paste-key')).toBeVisible();
    await expect(page.locator('.howto .url-chip')).toBeHidden();
  });

  test('falls back to a click when the permission cannot be queried', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.permissions.query = () => Promise.reject(new TypeError('unsupported'));
    });
    await page.goto('/');
    await expect(step2(page)).toHaveText(/paste/i);
  });

  test('follows the selected language', async ({ page }) => {
    await stubPermission(page, 'denied');
    await page.goto('/');
    await page.locator('#language-selector').selectOption('fr');
    await expect(step2(page)).toHaveText(/bloqué/i);
  });
});

// ─── paste works wherever the selection is ───────────────────────────────────

test.describe('paste target', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  async function seedClipboard(page) {
    await page.goto('/');
    await page.evaluate(async () => {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob(['<p style="color:red"><b>Hello</b> world</p>'], { type: 'text/html' }),
        'text/plain': new Blob(['Hello world'], { type: 'text/plain' }),
      })]);
    });
  }

  test('Ctrl/Cmd+V works right after load', async ({ page }) => {
    await seedClipboard(page);
    await page.keyboard.press('ControlOrMeta+v');
    await expect(page.locator('#mcguffin')).toHaveText('Hello world');
  });

  test('Ctrl/Cmd+V works after Select All put the selection in the help text', async ({ page }) => {
    await seedClipboard(page);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+v');
    await expect(page.locator('#mcguffin')).toHaveText('Hello world');
    await expect(page.locator('#formatting-message')).toHaveText(/cleaned/i);
  });

  test('Ctrl/Cmd+V works after clicking the help text', async ({ page }) => {
    await seedClipboard(page);
    await page.locator('#howto-step2').click();
    await page.keyboard.press('ControlOrMeta+v');
    await expect(page.locator('#mcguffin')).toHaveText('Hello world');
  });

  test('copying the selected sample and pasting it back shows it cleaned', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+c');
    const html = await page.evaluate(async () => {
      const [item] = await navigator.clipboard.read();
      return item.types.includes('text/html') ? await (await item.getType('text/html')).text() : '';
    });
    expect(html).toMatch(/style=/);              // the copy really is rich text
    await page.keyboard.press('ControlOrMeta+v');
    await expect(page.locator('#mcguffin')).toHaveText('Lorem ipsum dolor');
    await expect(page.locator('#formatting-message')).toHaveText(/cleaned/i);
  });

  test('a paste that does not target the editor is still cleaned', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/html', '<p><b>Hello</b> world</p>');
      document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await expect(page.locator('#mcguffin')).toHaveText('Hello world');
  });
});

// ─── automatic (silent) clipboard cleaning; clicks and keys never read ────────

test.describe('clipboard cleaning', () => {
  const HTML = '<p><b>Hello</b> world</p>';

  async function stubClipboard(page, perm) {
    await page.addInitScript(({ html, perm }) => {
      window.__written = [];
      window.__reads = 0;
      navigator.clipboard.read = async () => {
        window.__reads++;
        return [{ types: ['text/html'], getType: async () => new Blob([html], { type: 'text/html' }) }];
      };
      navigator.clipboard.writeText = async (text) => { window.__written.push(text); };
      navigator.permissions.query = async () => ({ state: perm, addEventListener() {} });
    }, { html: HTML, perm });
  }

  const reads = (page) => page.evaluate(() => window.__reads);

  test('automatic clean is silent: clipboard rewritten, no text or toast shown', async ({ page }) => {
    await stubClipboard(page, 'granted');
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => window.__written)).toEqual(['Hello world']);
    expect(await editorText(page)).toBe('');
    expect(await promptText(page)).toBe('');
  });

  test('nothing is read automatically while permission is still to be prompted', async ({ page }) => {
    await stubClipboard(page, 'prompt');
    await page.goto('/');
    await page.waitForTimeout(300);
    expect(await reads(page)).toBe(0);
  });

  test('clicks and keypresses never read the clipboard or show a toast', async ({ page }) => {
    await stubClipboard(page, 'prompt');
    await page.goto('/');
    await page.mouse.click(5, 300);
    await page.keyboard.press('Enter');
    await page.keyboard.press('a');
    await page.locator('#language-selector').click();
    await page.waitForTimeout(300);
    expect(await reads(page)).toBe(0);
    expect(await promptText(page)).toBe('');
    expect(await editorText(page)).not.toContain('Hello');
  });

  test('after the automatic clean, clicks and keys still do not read again', async ({ page }) => {
    await stubClipboard(page, 'granted');
    await page.goto('/');
    await expect.poll(() => reads(page)).toBe(1);
    await page.mouse.click(5, 300);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    expect(await reads(page)).toBe(1);
    expect(await promptText(page)).toBe('');
  });

  test('a failed silent read stays quiet', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.permissions.query = async () => ({ state: 'granted', addEventListener() {} });
      navigator.clipboard.read = async () => { throw new DOMException('denied', 'NotAllowedError'); };
    });
    await page.goto('/');
    await page.waitForTimeout(300);
    expect(await promptText(page)).toBe('');
    expect(await editorText(page)).toBe('');
  });

  test('Enter in the box is a normal line break', async ({ page }) => {
    await page.goto('/');
    await page.locator('#mcguffin').click({ position: { x: 5, y: 5 } });
    await page.keyboard.type('a');
    await page.keyboard.press('Enter');
    await page.keyboard.type('b');
    expect(await page.locator('#mcguffin').innerText()).toMatch(/a\s+b/);
  });

  test('the step text is selectable and clicking it selects rather than reads', async ({ page }) => {
    await stubClipboard(page, 'prompt');
    await page.goto('/');
    const step = page.locator('#howto-step2');
    await expect(step).toHaveCSS('user-select', 'text');
    await step.click({ clickCount: 3 });
    const selected = await page.evaluate(() => window.getSelection().toString());
    expect(selected).toMatch(/Open this page/);
    expect(await reads(page)).toBe(0);
  });
});

// ─── how-it-works table: examples, Select All, accessible label ───────────────

test.describe('how-it-works table', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('the "before" and "after" examples use the same words', async ({ page }) => {
    const before = await page.locator('.howto tr').nth(0).locator('td').first().innerText();
    const after = await page.locator('.howto tr').nth(2).locator('td').first().innerText();
    // Styling (colors, superscript) must not change the words
    expect(before.trim()).toBe(after.trim());
  });

  test('Select All on the empty page selects the styled sample', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+a');
    const selected = await page.evaluate(() => window.getSelection().toString());
    expect(selected).toBe('Lorem ipsum dolor');
  });

  test('Select All keeps its normal meaning once there is cleaned text', async ({ page }) => {
    await paste(page, { plain: 'some text' });
    await page.keyboard.press('ControlOrMeta+a');
    const selected = await page.evaluate(() => window.getSelection().toString());
    expect(selected).toBe('some text');
  });

  test('the paste icon has an accessible label that follows the language', async ({ page }) => {
    await expect(page.locator('.howto .paste-key')).toHaveAttribute('aria-label', 'Paste');
    await page.locator('#language-selector').selectOption('fr');
    await expect(page.locator('.howto .paste-key')).toHaveAttribute('aria-label', 'Coller');
  });
});

// ─── remove-formatting button ────────────────────────────────────────────────
// Hidden in Copy Clean mode — auto-clean on paste replaces it. Quick Edit shows it.

test.describe('remove-formatting button hidden', () => {
  test('remove-formatting button is hidden in Copy Clean mode', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#remove-formatting')).toBeHidden();
  });
});

// ─── paste edge cases ────────────────────────────────────────────────────────

test.describe('paste edge cases', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.clipboard.writeText(''));
    await page.reload();
  });

  test('does not execute scripts in pasted HTML', async ({ page }) => {
    await paste(page, {
      html: '<script>window.__xss_script = true<\/script><img src=x onerror="window.__xss_event=true">text',
      plain: 'text',
    });
    const { script, event: ev } = await page.evaluate(() => ({
      script: window.__xss_script,
      event: window.__xss_event,
    }));
    expect(script).toBeUndefined();
    expect(ev).toBeUndefined();
    const html = await page.locator('#mcguffin').innerHTML();
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
  });

  test('decodes HTML entities correctly', async ({ page }) => {
    await paste(page, {
      html: '<p>A &amp; B &lt; C &gt; D</p>',
      plain: 'A & B < C > D',
    });
    const text = await editorText(page);
    expect(text).toBe('A & B < C > D');
  });

  test('ignores whitespace-only plain text paste', async ({ page }) => {
    await paste(page, { plain: '   \n\t  ' });
    const text = await editorText(page);
    expect(text?.trim()).toBe('');
  });

  test('handles large content', async ({ page }) => {
    const large = 'x'.repeat(10000);
    await paste(page, { plain: large });
    const text = await editorText(page);
    expect(text?.length).toBe(10000);
  });

  test('trims surrounding whitespace', async ({ page }) => {
    await paste(page, { plain: '  hi  ' });
    expect(await editorText(page)).toBe('hi');
  });
});

// ─── typing ──────────────────────────────────────────────────────────────────

test.describe('typing', () => {
  test('no I-beam or caret on initial load; both appear once text is pasted', async ({ page }) => {
    await page.goto('/');
    const read = () => page.locator('#mcguffin').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { cursor: cs.cursor, caret: cs.caretColor };
    });
    const empty = await read();
    expect(empty.cursor).toBe('default');
    expect(empty.caret).toBe('rgba(0, 0, 0, 0)');
    await page.locator('#mcguffin').evaluate((el) => { el.textContent = 'hello'; });
    const filled = await read();
    expect(filled.cursor).toBe('text');
    expect(filled.caret).not.toBe('rgba(0, 0, 0, 0)');
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('updates when typing directly in the editor', async ({ page }) => {
    // Click the box's corner: the selectable help text covers its middle while empty
    await page.locator('#mcguffin').click({ position: { x: 5, y: 5 } });
    await page.keyboard.type('hello');
    await expect(page.locator('#mcguffin')).toHaveText('hello');
  });
});


// ─── language selector ───────────────────────────────────────────────────────

test.describe('language selector', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('switching language updates translated text', async ({ page }) => {
    // French step 1 starts with "Copiez" — different from the English value
    await page.locator('#language-selector').selectOption('fr');
    await expect(page.locator('.howto [data-i18n="howto_step1"]')).toHaveText(/Copiez/i, { timeout: 2000 });
  });

  test('switching back to English restores English text', async ({ page }) => {
    await page.locator('#language-selector').selectOption('fr');
    await page.locator('#language-selector').selectOption('en');
    await expect(page.locator('.howto [data-i18n="howto_step1"]')).toHaveText(/Copy formatted/i, { timeout: 2000 });
  });
});
