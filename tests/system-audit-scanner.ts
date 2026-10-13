import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { expect, type Page } from "@playwright/test";
export async function scannerAudit(page: Page, base: string) {
  const out = path.resolve((process.env.JAYDS_AUDIT_OUTPUT_DIR || "output/system-audit-2026-10-12") + "/scanner");
  mkdirSync(out, { recursive: true });
  const results: { feature: string; status: string; detail: string }[] = [];
  const payload = "jayds-audit-qr-synthetic-0000000000001";
  const image = await QRCode.toDataURL(payload, { margin: 3, width: 220, errorCorrectionLevel: "M" });
  for (const rotation of [0, 90, 180]) {
    const feature = `Real browser QR decoder reads synthetic camera pixels at ${rotation} degrees once and stops the stream`;
    let scans = 0;
    await page.route("**/api/orders/pickup", async route => {
      scans++;
      assert.equal(route.request().postDataJSON().qr, payload);
      await route.fulfill({ status: 409, json: { error: "Audit QR decoded; this synthetic token is not a real pickup" } });
    });
    try {
      await page.goto(base + "/dashboard");
      await page.evaluate(async ({ source, degrees }) => {
        const img = new Image(); img.src = source; await img.decode();
        const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 480;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "white"; ctx.fillRect(0, 0, 640, 480);
        ctx.translate(320, 240); ctx.rotate(degrees * Math.PI / 180); ctx.drawImage(img, -110, -110, 220, 220);
        const stream = canvas.captureStream(20);
        const state = Object.assign(window, { __auditQrTracks: stream.getTracks(), __auditQrCanvas: canvas });
        // Repaint to deliver actual video frames to html5-qrcode; the decoder
        // callback and its pixels are untouched.
        const timer = setInterval(() => {
          ctx.fillStyle = "white"; ctx.fillRect(-320, -240, 640, 480); ctx.drawImage(img, -110, -110, 220, 220);
          if (state.__auditQrTracks.every(track => track.readyState === "ended")) clearInterval(timer);
        }, 50);
        navigator.mediaDevices.getUserMedia = async () => stream;
      }, { source: image, degrees: rotation });
      await page.getByRole("button", { name: "Scan pickup", exact: true }).first().click();
      await expect(page.getByText("Audit QR decoded; this synthetic token is not a real pickup", { exact: true })).toBeVisible({ timeout: 15000 });
      await expect(page.getByRole("dialog", { name: "Scan pickup QR", exact: true })).toHaveCount(0);
      await page.waitForFunction(() => (window as unknown as { __auditQrTracks: MediaStreamTrack[] }).__auditQrTracks.every(track => track.readyState === "ended"));
      assert.equal(scans, 1, "A single image does not submit duplicate pickup requests");
      results.push({ feature, status: "PASS", detail: "Served POS + actual html5-qrcode decoder + canvas camera stream. Physical lens/lighting/phone screen remain a hands-on gate." });
    } catch (error) {
      results.push({ feature, status: "FAIL", detail: String(error).slice(0, 1700) });
      await page.screenshot({ path: path.join(out, `${rotation}-failure.png`) });
    } finally { await page.unroute("**/api/orders/pickup"); }
    writeFileSync(path.join(out, "results.json"), JSON.stringify({ checkedAt: new Date().toISOString(), base, physicalCamera: false, results }, null, 2));
    console.log(results.at(-1)?.status, feature);
  }
  return results;
}
