import { test, expect } from '@playwright/test';

const overview = {
  mode: 'shadow',
  queues: { active: 2, all: 3, urgent: 1, due: 1, overdue: 0, ordinary: 1, open: 2, acknowledged: 0, closed: 1 },
  generated_at: '2026-08-06T12:00:00Z',
  jobs: {
    pending: 0,
    processing: 0,
    failed: 0,
    stale: 0,
    oldest_pending_at: null,
    latest_completion_at: '2026-08-06T11:59:00Z',
  },
  alerts: { pending: 1, failed: 0, latest_delivery_at: '2026-08-06T11:58:00Z' },
  sla: { unacknowledged_urgent: 1, ordinary_due_soon: 1, overdue: 0 },
};

const summaries = [
  {
    id: 101,
    target_type: 'league_message',
    target_id: 501,
    state: 'open',
    severity: 'urgent',
    incident_type: 'credible_threat',
    urgent_since_at: '2026-08-06T10:00:00Z',
    dispositioned_at: null,
    due_at: '2099-08-06T13:00:00Z',
    current_action: null,
    report_count: 2,
    subject_name: 'Reported player',
    target_title: 'League message',
    target_snippet: 'This is the reported message.',
    target_media_type: null,
    source: 'member_report',
    primary_reason: 'harassment',
  },
  {
    id: 202,
    target_type: 'court_photo',
    target_id: 902,
    state: 'open',
    severity: 'ordinary',
    incident_type: null,
    urgent_since_at: null,
    dispositioned_at: null,
    due_at: '2099-08-07T12:00:00Z',
    current_action: null,
    report_count: 1,
    subject_name: 'Photo contributor',
    target_title: 'Court photo',
    target_snippet: null,
    target_media_type: 'image',
    source: 'automated',
    primary_reason: 'sexual_content',
  },
  {
    id: 303,
    target_type: 'direct_message',
    target_id: 703,
    state: 'closed',
    severity: 'ordinary',
    incident_type: null,
    urgent_since_at: null,
    dispositioned_at: '2026-08-06T11:00:00Z',
    due_at: null,
    current_action: 'dismiss',
    report_count: 1,
    subject_name: 'Previous subject',
    target_title: 'Direct message',
    target_snippet: 'A previously closed case.',
    target_media_type: null,
    source: 'member_report',
    primary_reason: 'other',
  },
];

const detail = (summary) => ({
  ...summary,
  legal_hold: false,
  subject: { id: summary.id + 10, display_name: summary.subject_name },
  target: {
    kind: summary.target_type,
    available: true,
    title: summary.target_title,
    text: summary.target_snippet,
    visibility: 'visible',
    metadata: { created_at: '2026-08-06T10:00:00Z' },
  },
  reports: [{
    id: summary.id + 1,
    reason: summary.primary_reason,
    details: 'Operator review requested.',
    created_at: '2026-08-06T10:02:00Z',
  }],
  provider_reviews: [],
  evidence: summary.id === 202 ? [{
    id: 77,
    state: 'available',
    content_type: 'image/jpeg',
    captured_at: '2026-08-06T10:03:00Z',
    purge_after: '2026-11-04T10:03:00Z',
  }] : [{
    id: 66,
    state: 'available',
    content_type: 'application/json',
    captured_at: '2026-08-06T10:03:00Z',
    purge_after: '2026-11-04T10:03:00Z',
  }],
  jobs: [],
  appeals: [],
  allowed_actions: ['acknowledge', 'dismiss', 'warn'],
  events: [{
    id: summary.id + 2,
    event_type: 'report_received',
    operator_user_id: null,
    operator_name: null,
    reason: null,
    created_at: '2026-08-06T10:02:00Z',
  }],
});

const contextPayload = {
  available: true,
  captured_at: '2026-08-06T10:03:00Z',
  messages: [
    { id: 499, created_at: '2026-08-06T09:58:00Z', speaker: 'other', text: 'Message before the report.', is_target: false },
    { id: 501, created_at: '2026-08-06T10:00:00Z', speaker: 'subject', text: 'This is the reported message.', is_target: true },
    { id: 502, created_at: '2026-08-06T10:01:00Z', speaker: 'other', text: 'Message after the report.', is_target: false },
  ],
};

const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X1Z8AAAAAElFTkSuQmCC',
  'base64',
);

async function installApiMocks(page) {
  const requests = [];
  await page.addInitScript(() => {
    window.localStorage.setItem('beach_access_token', 'mock-access-token');
    window.localStorage.setItem('beach_refresh_token', 'mock-refresh-token');
  });

  await page.route('**/mock-evidence/case-202.png', (route) => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: transparentPng,
  }));

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    requests.push(`${request.method()} ${path}${url.search}`);

    const json = (body, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

    if (path === '/api/auth/me') {
      return json({ id: 1, first_name: 'System', last_name: 'Administrator', email: 'admin@example.test', is_system_admin: true });
    }
    if (path === '/api/users/me/player') {
      return json({ id: 11, user_id: 1, full_name: 'System Administrator', first_name: 'System', nickname: 'System' });
    }
    if (path === '/api/users/me/leagues' || path === '/api/locations') return json([]);
    if (path === '/api/admin-view/moderation/overview') return json(overview);

    const contextMatch = path.match(/^\/api\/admin-view\/moderation\/cases\/(\d+)\/context$/);
    if (contextMatch) return json(contextPayload);

    const evidenceMatch = path.match(/^\/api\/admin-view\/moderation\/cases\/(\d+)\/evidence\/(\d+)\/url$/);
    if (evidenceMatch) return json({ url: `${url.origin}/mock-evidence/case-202.png`, expires_in: 300 });

    const detailMatch = path.match(/^\/api\/admin-view\/moderation\/cases\/(\d+)$/);
    if (detailMatch) {
      const selected = summaries.find((item) => item.id === Number(detailMatch[1]));
      return selected ? json(detail(selected)) : json({ detail: 'Not found' }, 404);
    }

    if (path === '/api/admin-view/moderation/cases') {
      const state = url.searchParams.get('state');
      const queue = url.searchParams.get('queue');
      let items = summaries;
      if (state === 'active') items = items.filter((item) => item.state !== 'closed');
      else if (state === 'open' || state === 'acknowledged' || state === 'closed') {
        items = items.filter((item) => item.state === state);
      }
      if (queue === 'urgent') items = items.filter((item) => item.severity === 'urgent');
      if (queue === 'ordinary') items = items.filter((item) => item.severity === 'ordinary');
      return json({ items, totals: overview.queues, total: state === 'all' || state == null ? 8 : items.length, total_pages: 1 });
    }

    return json({});
  });
  return requests;
}

async function openModeration(page, query = '') {
  await page.goto(`/admin-view?tab=moderation${query}`);
  await expect(page.getByRole('heading', { name: 'Moderation control desk' })).toBeVisible();
}

function statusControl(page) {
  return page.getByRole('group', { name: /status/i });
}

function attentionControl(page) {
  return page.getByRole('group', { name: /attention|priority/i });
}

test.describe('moderation workspace with mocked APIs', () => {
  test('all cases, independent filters, selection, context, and keyboard state work', async ({ page }) => {
    const requests = await installApiMocks(page);
    await openModeration(page);

    await expect(statusControl(page)).toBeVisible();
    await expect(attentionControl(page)).toBeVisible();
    const allCases = statusControl(page).getByRole('button', { name: /All cases/i });
    await allCases.click();
    await expect(page).toHaveURL(/state=all/);
    await expect(allCases).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(/Showing 3 of 8 cases/i)).toBeVisible();

    const urgent = attentionControl(page).getByRole('button', { name: /Urgent/i });
    await urgent.click();
    await expect(page).toHaveURL(/state=all.*queue=urgent/);
    await expect(urgent).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /Case 101/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Case 202/ })).toHaveCount(0);
    expect(requests.some((request) => request.includes('/moderation/cases?') && request.includes('queue=urgent'))).toBe(true);

    await attentionControl(page).getByRole('button', { name: /^All$/i }).click();
    const firstCase = page.getByRole('button', { name: /Case 101/ });
    const secondCase = page.getByRole('button', { name: /Case 202/ });
    await firstCase.click();
    await expect(firstCase).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: /Reported content & context/i })).toBeVisible();
    await expect(page.getByText('This is the reported message.', { exact: true }).first()).toBeVisible();

    const showContext = page.getByRole('button', { name: /Show conversation context/i });
    await showContext.click();
    await expect(page.getByText('Message before the report.')).toBeVisible();
    await expect(page.getByText('Message after the report.')).toBeVisible();
    await expect(page.getByText('This is the reported message.', { exact: true }).last()).toBeVisible();
    expect(requests.some((request) => request === 'GET /api/admin-view/moderation/cases/101/context')).toBe(true);

    await firstCase.focus();
    await firstCase.press('ArrowDown');
    await expect(secondCase).toBeFocused();
  });

  test('image evidence is deliberately revealed through the audited URL endpoint', async ({ page }) => {
    const requests = await installApiMocks(page);
    await openModeration(page, '&state=all');

    await page.getByRole('button', { name: /Case 202/ }).click();
    await expect(page.getByRole('heading', { name: /Reported content & context/i })).toBeVisible();
    const reveal = page.getByRole('button', { name: /Reveal.*image|View.*image|Open.*evidence/i }).first();
    await reveal.click();

    await expect.poll(() => requests.some((request) => (
      request === 'GET /api/admin-view/moderation/cases/202/evidence/77/url'
    ))).toBe(true);
    const preview = page.getByRole('img', { name: /evidence|reported/i });
    await expect(preview).toBeVisible();
  });

  for (const width of [320, 390, 430]) {
    test(`phone workflow is usable without page overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await installApiMocks(page);
      await openModeration(page, '&state=all');

      await expect(statusControl(page)).toBeVisible();
      await expect(attentionControl(page)).toBeVisible();
      await expect(statusControl(page).getByRole('button', { name: /All cases/i })).toHaveAttribute('aria-pressed', 'true');
      await expect(attentionControl(page).getByRole('button', { name: /^All$/i })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByText(/Showing 3 of 8 cases/i)).toBeVisible();

      const listOverflow = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      }));
      expect(listOverflow.documentWidth).toBeLessThanOrEqual(listOverflow.viewportWidth + 1);

      await page.getByRole('button', { name: /Case 101/ }).click();
      await expect(page.getByText('This is the reported message.', { exact: true }).first()).toBeVisible();
      const back = page.getByRole('button', { name: /Back to cases/i });
      await expect(back).toBeVisible();

      const overflow = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);

      await back.click();
      await expect(page.getByRole('button', { name: /Case 101/ })).toBeVisible();
      await expect(page.locator('section[aria-label="Case queue"]')).toBeVisible();
    });
  }
});
