import { test, expect } from "@playwright/test";

test("edits names, pins, monitoring and refreshes from the flat account list", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.goto("/?view=detail");
  const root = page.locator(".qd-root");
  await expect(root.getByRole("heading", { name: "个人账户", exact: true })).toBeVisible();
  await expect(root.getByRole("progressbar", { name: "5 小时剩余额度" }).first()).toHaveAttribute("aria-valuenow", "72");
  await expect(page.getByText("模拟数据", { exact: true })).toBeVisible();
  await root.screenshot({ path: "artifacts/settings-native-dark.png" });
  await page.getByRole("searchbox", { name: "搜索账户" }).fill("工作");
  await expect(root.locator(".qd-card")).toHaveCount(1);
  await page.getByRole("searchbox", { name: "搜索账户" }).fill("不存在");
  await expect(root.getByText("无匹配账户")).toBeVisible();
  await page.getByRole("searchbox", { name: "搜索账户" }).clear();
  await page.getByRole("switch", { name: "置顶工作账户", exact: true }).check();
  await expect(page.getByRole("switch", { name: "置顶工作账户", exact: true })).toBeChecked();
  const work = root.locator('[data-account-ref="demo-work"]');
  await work.getByRole("switch", { name: "监控工作账户" }).uncheck();
  await expect(work.locator(".qd-badge")).toHaveText("已暂停");
  await expect(work.getByRole("button", { name: "刷新工作账户", exact: true })).toBeDisabled();
  await expect(root.locator(".qd-card")).toHaveCount(3);
  await work.getByRole("switch", { name: "监控工作账户" }).check();
  await expect(work.getByRole("button", { name: "刷新工作账户", exact: true })).toBeEnabled();
  const personal = root.locator('[data-account-ref="demo-personal"]');
  await personal.getByRole("button", { name: "重命名个人账户" }).click();
  await personal.getByRole("textbox", { name: "个人账户名称" }).fill("研究账户");
  await personal.getByRole("button", { name: "保存", exact: true }).click();
  await expect(personal.getByRole("heading", { name: "研究账户", exact: true })).toBeVisible();
  await expect(personal.getByRole("textbox")).toHaveCount(0);
  await personal.getByRole("button", { name: "刷新研究账户", exact: true }).click();
  await expect(personal.locator(".qd-updated")).toHaveText("0 秒前");
  await page.getByLabel("账户排序").selectOption("remaining");
  await expect(page.getByLabel("账户排序")).toHaveValue("remaining");
});

test("shows concise failure and empty states with the relevant actions", async ({ page }) => {
  await page.goto("/?view=detail");
  const root = page.locator(".qd-root");
  await expect(root.locator(".qd-card")).toHaveCount(3);
  await page.getByLabel("预览状态").selectOption("offline");
  await expect(root.getByRole("alert")).toHaveText("服务离线");
  await expect(root.locator(".qd-card")).toHaveCount(3);
  await page.getByLabel("预览状态").selectOption("unknown");
  await expect(root.locator('[data-account-ref="demo-personal"] .qd-badge')).toHaveText("无数据");
  await page.getByLabel("预览状态").selectOption("unsupported");
  const unsupported = root.locator('[data-account-ref="demo-personal"]');
  await expect(unsupported.locator(".qd-badge")).toHaveText("暂不支持");
  await expect(unsupported.getByRole("button", { name: "ChatGPT 用量" })).toBeVisible();
  await expect(root.getByRole("button", { name: "登录", exact: true })).toBeVisible();
  await page.getByLabel("预览状态").selectOption("directory-error");
  await expect(root.getByRole("status")).toHaveText("账户同步失败");
  await page.getByLabel("预览状态").selectOption("bridge-error");
  await expect(root.getByRole("status")).toHaveText("Codex CLI 未连接");
  await page.getByLabel("预览状态").selectOption("empty");
  await expect(root.getByRole("heading", { name: "无账户", exact: true })).toBeVisible();
  await expect(root.getByRole("button", { name: "添加账户" })).toBeVisible();
});

test("preserves the saved name when editing is cancelled or saving fails", async ({ page }) => {
  await page.goto("/?view=detail");
  const personal = page.locator('[data-account-ref="demo-personal"]');
  await personal.getByRole("button", { name: "重命名个人账户" }).click();
  const input = personal.getByRole("textbox", { name: "个人账户名称" });
  await input.fill("  ");
  await expect(personal.getByRole("button", { name: "保存", exact: true })).toBeDisabled();
  await input.fill("未保存名称");
  await input.press("Escape");
  await expect(personal.getByRole("heading", { name: "个人账户", exact: true })).toBeVisible();
  await expect(personal.getByRole("button", { name: "重命名个人账户" })).toBeFocused();
  await page.getByLabel("预览状态").selectOption("save-error");
  await personal.getByRole("button", { name: "重命名个人账户" }).click();
  await input.fill("保存失败名称");
  await input.press("Enter");
  await expect(page.getByRole("alert")).toHaveText("保存失败");
  await expect(personal.getByRole("heading", { name: "个人账户", exact: true })).toBeVisible();
  await expect(input).toHaveValue("保存失败名称");
  await personal.getByRole("button", { name: "取消", exact: true }).click();
  await expect(personal.getByRole("textbox")).toHaveCount(0);
});

test("keeps readings and controls aligned in light mode with long names at 300px", async ({ page }) => {
  await page.setViewportSize({ width: 300, height: 900 });
  await page.goto("/?view=detail");
  await page.getByRole("button", { name: "切换主题" }).click();
  const root = page.locator(".qd-root");
  await expect(root).toHaveAttribute("data-theme", "light");
  const personal = root.locator('[data-account-ref="demo-personal"]');
  await personal.getByRole("button", { name: "重命名个人账户" }).click();
  await personal.getByRole("textbox", { name: "个人账户名称" }).fill("研究团队长期使用的订阅账户名称".repeat(3));
  await personal.getByRole("button", { name: "保存", exact: true }).click();
  await expect(personal.getByRole("textbox")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await root.locator(".qd-card,.qd-window,.qd-account-tools").evaluateAll(elements => elements.every(element => element.scrollWidth <= element.clientWidth))).toBe(true);
  const tracks = await root.locator(".qd-track").evaluateAll(elements => elements.map(element => ({ x: element.getBoundingClientRect().x, width: element.getBoundingClientRect().width })));
  for (const track of tracks) {
    expect(Math.abs(track.x - tracks[0]!.x)).toBeLessThan(.1);
    expect(Math.abs(track.width - tracks[0]!.width)).toBeLessThan(.1);
  }
  await root.screenshot({ path: "artifacts/settings-native-light-narrow.png" });
});
