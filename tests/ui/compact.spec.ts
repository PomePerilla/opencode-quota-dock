import { test, expect } from "@playwright/test";

async function columnGeometry(page: import("@playwright/test").Page) {
  return page.locator(".qd-compact-quota").evaluateAll(groups => groups.map(group => {
    const track = group.querySelector(".qd-compact-track")!.getBoundingClientRect();
    const time = group.querySelector(".qd-compact-time")!.getBoundingClientRect();
    return { period: (group as HTMLElement).dataset.period, trackX: track.x, trackWidth: track.width, timeX: time.x, timeWidth: time.width, timeEnd: time.right };
  }));
}

function expectAligned(columns: Awaited<ReturnType<typeof columnGeometry>>) {
  for (const period of ["five-hour", "weekly"]) {
    const matching = columns.filter(column => column.period === period);
    for (const column of matching.slice(1)) {
      for (const key of ["trackX", "trackWidth", "timeX", "timeWidth", "timeEnd"] as const)
        expect(Math.abs(column[key] - matching[0]![key])).toBeLessThan(.1);
    }
  }
  // Both periods also receive equal-length tracks and equal countdown space.
  expect(Math.abs(columns[0]!.trackWidth - columns[1]!.trackWidth)).toBeLessThan(.1);
  expect(Math.abs(columns[0]!.timeWidth - columns[1]!.timeWidth)).toBeLessThan(.1);
}
test("gives each account its own row with independent five-hour and weekly bars and countdowns", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 720 });
  await page.goto("/");
  const sidebar = page.locator("#vertical-tabs-sidebar");
  const dock = sidebar.locator(".qd-sidebar-host");
  await expect(dock.locator(".qd-compact-account")).toHaveCount(2);
  await expect(dock).toContainText("XZ");
  await expect(dock).toContainText("1h32m");
  const xz = dock.locator('[data-account-ref="demo-xz"]');
  await expect(xz.locator('.qd-compact-track')).toHaveCount(2);
  await expect(xz.locator('[data-period="five-hour"] .qd-compact-track')).toHaveAttribute("aria-valuenow", "72");
  await expect(xz.locator('[data-period="weekly"] .qd-compact-track')).toHaveAttribute("aria-valuenow", "41");
  await expect(xz.locator('[data-period="five-hour"] .qd-compact-time')).toHaveText("1h32m");
  await expect(xz.locator('[data-period="weekly"] .qd-compact-time')).toHaveText("2d19h");
  const accounts = await dock.locator(".qd-compact-account").all();
  const first = (await accounts[0]!.boundingBox())!;
  const second = (await accounts[1]!.boundingBox())!;
  expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
  expect(Math.abs(first.x - second.x)).toBeLessThan(1);
  const periods = await xz.locator('.qd-compact-quota').all();
  expect(Math.abs((await periods[0]!.boundingBox())!.y - (await periods[1]!.boundingBox())!.y)).toBeLessThan(1);
  const navFooter = (await sidebar.locator(".native-sidebar-footer").boundingBox())!;
  expect(first.y).toBeGreaterThanOrEqual(navFooter.y + navFooter.height);
  expect(first.x).toBeLessThan(260); expect(first.y).toBeGreaterThan(620);
  await expect(dock.locator("h1,h2,input,select,.qd-header,.qd-footer")).toHaveCount(0);
  await page.screenshot({ path: "artifacts/compact-aligned-dark.png" });
  await dock.screenshot({ path: "artifacts/compact-aligned-dark-detail.png", scale: "css" });
  await accounts[0]!.click({ button: "right" });
  await expect(page.getByRole("dialog", { name: "额度设置" })).toBeVisible();
});
test("handles sidebar resizing, collapse and remount without duplicate widgets", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 720 });
  await page.goto("/?theme=light");
  await expect(page.locator(".qd-sidebar-host")).toHaveCount(1);
  await page.getByLabel("侧栏宽度").selectOption("160");
  await expect.poll(async () => {
    const rows = await page.locator(".qd-compact-account").all();
    return (await rows[1]!.boundingBox())!.y > (await rows[0]!.boundingBox())!.y;
  }).toBe(true);
  await expect.poll(() => page.locator(".qd-compact").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(page.locator('.qd-compact-track')).toHaveCount(4);
  await expect.poll(() => page.locator('.qd-compact-account').evaluateAll(rows => rows.every(row => row.scrollWidth <= row.clientWidth))).toBe(true);
  await page.screenshot({ path: "artifacts/compact-aligned-light-narrow.png" });
  await page.getByRole("button", { name: "收起/展开" }).click();
  await expect(page.locator("#vertical-tabs-sidebar")).toHaveAttribute("data-state", "closed");
  await page.getByRole("button", { name: "收起/展开" }).click();
  await page.getByRole("button", { name: "移除/恢复侧栏" }).click();
  await expect(page.locator(".qd-sidebar-host")).toHaveCount(0);
  await page.getByRole("button", { name: "移除/恢复侧栏" }).click();
  await expect(page.locator(".qd-sidebar-host")).toHaveCount(1);
  await expect(page.locator(".qd-compact-account")).toHaveCount(2);
});

test("keeps columns fixed across accounts and countdown digit changes at each sidebar width", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-17T03:00:00Z") });
  await page.goto("/");
  await expect(page.locator(".qd-compact-track")).toHaveCount(4);
  await expect(page.locator('[data-account-ref="demo-xy"] [data-period="weekly"] .qd-compact-time')).toHaveText("23h59m");
  const before = new Map<string, Awaited<ReturnType<typeof columnGeometry>>>();
  for (const width of ["136", "160", "240", "320"]) {
    await page.getByLabel("侧栏宽度").selectOption(width);
    const columns = await columnGeometry(page);
    expectAligned(columns);
    before.set(width, columns);
    expect(await page.locator(".qd-compact-account").evaluateAll(rows => rows.every(row => row.scrollWidth <= row.clientWidth))).toBe(true);
    expect(await page.locator(".qd-compact-quota").evaluateAll(groups => groups.every(group => group.scrollWidth <= group.clientWidth))).toBe(true);
    for (const time of await page.locator(".qd-compact-time").all())
      expect(await time.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  await page.clock.fastForward(83 * 60_000);
  await expect(page.locator('[data-account-ref="demo-xz"] [data-period="five-hour"] .qd-compact-time')).toHaveText("9m");
  for (const width of ["136", "160", "240", "320"]) {
    await page.getByLabel("侧栏宽度").selectOption(width);
    expect(await columnGeometry(page)).toEqual(before.get(width));
  }
});

test("aligns unknown placeholders with known readings in light mode and scaled rendering", async ({ page }) => {
  await page.goto("/?theme=light&sample=unknown");
  const unknown = page.locator('[data-account-ref="demo-xy"]');
  await expect(unknown.locator(".qd-compact-time")).toHaveText(["—", "—"]);
  await expect(unknown.getByRole("progressbar").first()).not.toHaveAttribute("aria-valuenow");
  for (const width of ["136", "160", "240", "320"]) {
    await page.getByLabel("侧栏宽度").selectOption(width);
    expectAligned(await columnGeometry(page));
  }
  await page.getByLabel("侧栏宽度").selectOption("240");
  await page.locator(".qd-sidebar-host").evaluate(element => { element.style.zoom = "1.5"; });
  expectAligned(await columnGeometry(page));
  expect(await page.locator(".qd-compact-quota").evaluateAll(groups => groups.every(group => group.scrollWidth <= group.clientWidth))).toBe(true);
  await page.locator(".qd-sidebar-host").evaluate(element => { element.style.zoom = "1"; });
  await page.locator(".qd-sidebar-host").screenshot({ path: "artifacts/compact-aligned-light-unknown-detail.png", scale: "css" });
});
