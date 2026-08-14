/** Deterministic browser/network controls for unhappy-path E2E coverage. */

export async function failApi(page, urlPattern, status, body = { detail: 'Controlled E2E failure' }) {
  await page.route(urlPattern, async (route) => {
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

export async function delayApi(page, urlPattern, delayMs = 1500) {
  await page.route(urlPattern, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.continue();
  });
}

export async function disconnectApi(page, urlPattern) {
  await page.route(urlPattern, (route) => route.abort('connectionreset'));
}

export async function setOffline(context, offline = true) {
  await context.setOffline(offline);
}

export async function fulfillSequence(page, urlPattern, responses) {
  let index = 0;
  await page.route(urlPattern, async (route) => {
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (response.disconnect) return route.abort('connectionreset');
    if (response.delayMs) await new Promise((resolve) => setTimeout(resolve, response.delayMs));
    return route.fulfill({
      status: response.status,
      contentType: 'application/json',
      body: JSON.stringify(response.body ?? {}),
    });
  });
}

export async function clickRapidly(locator, count = 2) {
  await locator.click({ clickCount: count, delay: 10 });
}
