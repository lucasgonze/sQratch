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

/** Read the current character-counter value. */
async function counterText(page) {
  return page.locator('#counter').textContent();
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

  test('site name says "Copy Clean"', async ({ page }) => {
    await expect(page.locator('nav')).toContainText('Copy Clean');
  });

  test('tagline says "Formatting in, plain text out"', async ({ page }) => {
    await expect(page.locator('#tagline')).toContainText('Formatting in, plain text out');
  });

  test('editor shows placeholder when empty', async ({ page }) => {
    // data-placeholder is set by applyTranslations after load
    await expect(page.locator('#mcguffin')).toHaveAttribute('data-placeholder', /paste/i, { timeout: 3000 });
  });

  test('editor is focused on load', async ({ page }) => {
    const focused = await page.evaluate(() => document.activeElement?.id);
    expect(focused).toBe('mcguffin');
  });

  test('counter starts empty', async ({ page }) => {
    // Counter is updated only on input, so it starts blank
    await expect(page.locator('#counter')).toHaveText('');
  });

  test('markdown toggle button is hidden', async ({ page }) => {
    await expect(page.locator('#convert-to-markdown')).toBeHidden();
  });

  test('help toggle button is hidden', async ({ page }) => {
    await expect(page.locator('#toggle-help')).toBeHidden();
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

  test('updates character counter after paste', async ({ page }) => {
    await paste(page, { plain: 'hello' });
    const count = await counterText(page);
    expect(count).toBe('5');
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
// Button removed — paste already copies the cleaned text.

test.describe('copy-all button absent', () => {
  test('copy-all button does not exist in the DOM', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#copy-all')).toHaveCount(0);
  });
});

// ─── remove-formatting button ────────────────────────────────────────────────
// Button removed — auto-clean on paste replaces it.

test.describe('remove-formatting button absent', () => {
  test('remove-formatting button does not exist in the DOM', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#remove-formatting')).toHaveCount(0);
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

  test('handles large content and updates counter accurately', async ({ page }) => {
    const large = 'x'.repeat(10000);
    await paste(page, { plain: large });
    const text = await editorText(page);
    expect(text?.length).toBe(10000);
    const count = await counterText(page);
    expect(count).toBe('10000');
  });

  test('counter reflects trimmed length (ignores surrounding whitespace)', async ({ page }) => {
    await paste(page, { plain: '  hi  ' });
    const count = await counterText(page);
    expect(count).toBe('2');
  });
});

// ─── character counter ───────────────────────────────────────────────────────

test.describe('character counter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('updates when typing directly in the editor', async ({ page }) => {
    await page.locator('#mcguffin').click();
    await page.keyboard.type('hello');
    await expect(page.locator('#counter')).toHaveText('5');
  });
});


// ─── language selector ───────────────────────────────────────────────────────

test.describe('language selector', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('switching language updates translated text', async ({ page }) => {
    // French placeholder is "Écrivez ici" — different from the English value
    await page.locator('#language-selector').selectOption('fr');
    await expect(page.locator('#mcguffin')).toHaveAttribute('data-placeholder', /Écrivez/i, { timeout: 2000 });
  });

  test('switching back to English restores English text', async ({ page }) => {
    await page.locator('#language-selector').selectOption('fr');
    await page.locator('#language-selector').selectOption('en');
    await expect(page.locator('#mcguffin')).toHaveAttribute('data-placeholder', /paste/i, { timeout: 2000 });
  });
});
