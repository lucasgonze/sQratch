// @ts-check
import { test, expect } from '@playwright/test';

// Dual-use: Copy Clean is the default; Quick Edit is the secondary mode.
// Mode is exposed as the `edit` class on <body>; no class means clean mode.

// ─── helpers ────────────────────────────────────────────────────────────────

// Visible in edit mode as soon as it loads.
const EDIT_CONTROLS = [
  '#convert-to-markdown',
  '#remove-formatting',
  '#copy-all',
];
// The counter shows once there is text; copy-formatted and help live in the preview bar,
// which appears after M↓ is on.
const OLD_EDITOR_CONTROLS = [...EDIT_CONTROLS, '#counter', '#copy-formatted', '#toggle-help'];

/** Dispatch a synthetic paste event on the editor; resolve to whether it was intercepted. */
async function pasteIntercepted(page, html) {
  return page.evaluate((html) => {
    const dt = new DataTransfer();
    dt.setData('text/html', html);
    dt.setData('text/plain', 'Hello world');
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    document.getElementById('mcguffin').dispatchEvent(ev);
    return ev.defaultPrevented;
  }, html);
}

async function stubClipboard(page, perm) {
  await page.addInitScript((perm) => {
    window.__written = [];
    window.__reads = 0;
    navigator.clipboard.read = async () => {
      window.__reads++;
      return [{ types: ['text/html'], getType: async () => new Blob(['<p><b>Hello</b> world</p>'], { type: 'text/html' }) }];
    };
    navigator.clipboard.writeText = async (text) => { window.__written.push(text); };
    navigator.permissions.query = async () => ({ state: perm, addEventListener() {} });
  }, perm);
}

// ─── default: clean mode ─────────────────────────────────────────────────────

test.describe('clean mode (default)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('loads in clean mode', async ({ page }) => {
    await expect(page.locator('body')).not.toHaveClass(/\bedit\b/);
    await expect(page.locator('.howto')).toBeVisible();
  });

  test('has an unchecked pencil checkbox labeled "Editor"', async ({ page }) => {
    await expect(page.locator('#mode-switch svg')).toBeVisible();
    await expect(page.locator('#mode-checkbox')).toHaveAttribute('aria-label', 'Editor');
    await expect(page.locator('#mode-checkbox')).not.toBeChecked();
  });

  test('the old editor controls are hidden', async ({ page }) => {
    for (const sel of OLD_EDITOR_CONTROLS) {
      await expect(page.locator(sel), sel).toBeHidden();
    }
  });
});

// ─── switching: toggle ───────────────────────────────────────────────────────

test.describe('mode checkbox', () => {
  test('the tagline never changes with the mode', async ({ page }) => {
    await page.goto('/');
    const tagline = page.locator('#tagline');
    await expect(tagline).toContainText('Copy formatted text. Paste it clean.');
    await page.locator('#mode-checkbox').check();
    await expect(tagline).toContainText('Copy formatted text. Paste it clean.');
    await page.locator('#mode-checkbox').uncheck();
    await expect(tagline).toContainText('Copy formatted text. Paste it clean.');
  });

  test('the tagline is the same when loading in edit mode, and still translates', async ({ page }) => {
    await page.goto('/#edit');
    await expect(page.locator('#tagline')).toContainText('Copy formatted text. Paste it clean.');
    await page.locator('#language-selector').selectOption('fr');
    await expect(page.locator('#tagline')).toContainText('Copiez du texte formaté. Collez-le propre.');
  });

  test('typing checks the Editor checkbox', async ({ page }) => {
    await page.goto('/');
    await page.locator('#mcguffin').focus();
    await page.keyboard.type('hi');
    await expect(page.locator('#mode-checkbox')).toBeChecked();
  });

  test('#edit loads with the checkbox checked', async ({ page }) => {
    await page.goto('/#edit');
    await expect(page.locator('#mode-checkbox')).toBeChecked();
  });

  test('checking and unchecking switches modes', async ({ page }) => {
    await page.goto('/');
    await page.locator('#mode-checkbox').check();
    await expect(page.locator('body')).toHaveClass(/\bedit\b/);
    await page.locator('#mode-checkbox').uncheck();
    await expect(page.locator('body')).not.toHaveClass(/\bedit\b/);
  });

  test('the chosen mode is remembered across reloads', async ({ page }) => {
    await page.goto('/');
    await page.locator('#mode-checkbox').check();
    await page.goto('/');
    await expect(page.locator('body')).toHaveClass(/\bedit\b/);
  });
});

// ─── switching: URL hash ─────────────────────────────────────────────────────

test.describe('hash routing', () => {
  test('#edit loads edit mode', async ({ page }) => {
    await page.goto('/#edit');
    await expect(page.locator('body')).toHaveClass(/\bedit\b/);
  });

  test('#fr,edit loads French and edit mode', async ({ page }) => {
    await page.goto('/#fr,edit');
    await expect(page.locator('body')).toHaveClass(/\bedit\b/);
    await expect(page.locator('#language-selector')).toHaveValue('fr');
  });

  test('a language-only hash stays in clean mode', async ({ page }) => {
    await page.goto('/#fr');
    await expect(page.locator('body')).not.toHaveClass(/\bedit\b/);
    await expect(page.locator('#language-selector')).toHaveValue('fr');
  });

  test('changing language in edit mode keeps edit mode in the hash', async ({ page }) => {
    await page.goto('/#edit');
    await page.locator('#language-selector').selectOption('de');
    await expect(page.locator('body')).toHaveClass(/\bedit\b/);
    expect(await page.evaluate(() => location.hash)).toMatch(/de/);
    expect(await page.evaluate(() => location.hash)).toMatch(/edit/);
  });

  test('the hash wins over the remembered mode', async ({ page }) => {
    await page.goto('/#edit');
    await page.locator('#mode-checkbox').uncheck();     // now clean, remembered
    await page.goto('/#edit');
    await expect(page.locator('body')).toHaveClass(/\bedit\b/);
  });
});

// ─── switching: typing ───────────────────────────────────────────────────────

test.describe('auto-switch on typing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('typing in the editor switches to edit mode', async ({ page }) => {
    await page.locator('#mcguffin').focus();
    await page.keyboard.type('hi');
    await expect(page.locator('body')).toHaveClass(/\bedit\b/);
  });

  test('pasting does not switch modes', async ({ page }) => {
    await pasteIntercepted(page, '<p><b>Hello</b> world</p>');
    await expect(page.locator('body')).not.toHaveClass(/\bedit\b/);
  });
});

// ─── edit mode: the old editor is back ───────────────────────────────────────

test.describe('edit mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#edit');
  });

  test('shows the old editor buttons', async ({ page }) => {
    for (const sel of EDIT_CONTROLS) {
      await expect(page.locator(sel), sel).toBeVisible();
    }
  });

  test('preview bar shows copy-formatted and help once markdown is on', async ({ page }) => {
    await page.locator('#mcguffin').click();
    await page.keyboard.type('hello');
    await page.locator('#convert-to-markdown').click();
    await expect(page.locator('#copy-formatted')).toBeVisible();
    await expect(page.locator('#toggle-help')).toBeVisible();
  });

  test('hides the how-it-works table', async ({ page }) => {
    await expect(page.locator('.howto')).toBeHidden();
  });

  test('character counter follows typing', async ({ page }) => {
    await page.locator('#mcguffin').click();
    await page.keyboard.type('hello');
    await expect(page.locator('#counter')).toContainText('5');
  });

  test('markdown button shows the preview', async ({ page }) => {
    await page.locator('#mcguffin').click();
    await page.keyboard.type('hello');
    await page.locator('#convert-to-markdown').click();
    await expect(page.locator('#markdown-preview')).toBeVisible();
  });

  test('help toggle shows the markdown help panel', async ({ page }) => {
    await page.locator('#mcguffin').click();
    await page.keyboard.type('hello');
    await page.locator('#convert-to-markdown').click();
    await page.locator('#toggle-help').click();
    await expect(page.locator('#markdown-help')).toBeVisible();
  });

  test('remove-formatting button is enabled', async ({ page }) => {
    await expect(page.locator('#remove-formatting')).toBeEnabled();
  });

  test('copy-all copies the editor text', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator('#mcguffin').click();
    await page.keyboard.type('copy me');
    await page.locator('#copy-all').click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('copy me');
  });

  test('paste is not intercepted by the cleaner', async ({ page }) => {
    expect(await pasteIntercepted(page, '<p><b>Hello</b> world</p>')).toBe(false);
  });
});

test.describe('edit mode: no automatic clipboard clean', () => {
  test('does not read or rewrite the clipboard on load', async ({ page }) => {
    await stubClipboard(page, 'granted');
    await page.goto('/#edit');
    await expect(page.locator('body')).toHaveClass(/\bedit\b/);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__reads)).toBe(0);
    expect(await page.evaluate(() => window.__written)).toEqual([]);
  });

  test('clean mode still cleans the clipboard on load (control)', async ({ page }) => {
    await stubClipboard(page, 'granted');
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => window.__written)).toEqual(['Hello world']);
  });
});

// ─── returning to clean mode ─────────────────────────────────────────────────

test.describe('back to clean mode', () => {
  test('hides the old controls and restores the table when the editor is empty', async ({ page }) => {
    await page.goto('/#edit');
    await page.locator('#mode-checkbox').uncheck();
    await expect(page.locator('body')).not.toHaveClass(/\bedit\b/);
    for (const sel of OLD_EDITOR_CONTROLS) {
      await expect(page.locator(sel), sel).toBeHidden();
    }
    await expect(page.locator('.howto')).toBeVisible();
  });
});

// ─── markdown preview: links cannot carry script ─────────────────────────────

test.describe('markdown preview safety', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#edit');
  });

  /** Render markdown, parse the result, and describe every <a> and <img> in it. */
  async function render(page, md) {
    return page.evaluate((md) => {
      const box = document.createElement('div');
      box.innerHTML = renderMarkdown(md);
      return [...box.querySelectorAll('a, img')].map((el) => ({
        tag: el.tagName,
        attrs: el.getAttributeNames(),
        href: el.getAttribute('href'),
      }));
    }, md);
  }

  test('a quote in a link URL cannot add attributes', async ({ page }) => {
    const [a] = await render(page, '[x](y" onmouseover="alert(1))');
    expect(a.attrs).toEqual(['href']);
  });

  for (const url of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)', 'data:text/html,hi', 'vbscript:x']) {
    test(`link scheme is blocked: ${JSON.stringify(url)}`, async ({ page }) => {
      const [a] = await render(page, `[x](${url})`);
      expect(a.href).toBe('#');
    });
  }

  for (const url of ['https://example.com/a?b=1&c=2', 'http://example.com', 'mailto:a@b.co', '/relative/path', '#section', 'page.html']) {
    test(`safe link is kept: ${url}`, async ({ page }) => {
      const [a] = await render(page, `[x](${url})`);
      expect(a.href).toBe(url);
    });
  }

  test('angle brackets in text are still escaped', async ({ page }) => {
    const found = await render(page, '<img src=x onerror=alert(1)>');
    expect(found).toEqual([]);
  });
});
