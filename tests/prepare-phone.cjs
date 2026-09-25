// Check the confirmation and Spoolman printing handoff on the LAN test instance.
// Login credentials remain in ignored local storage; no printer job is sent.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const Q = require('../octoprint_Spoolman/static/js/common/qr.js');
const output = path.join(__dirname, 'output');

async function run() {
    const state = JSON.parse(await fs.readFile(path.join(__dirname, '../docker-data/qr-phone/session.json')));
    const fixture = JSON.parse(await fs.readFile(path.join(output, 'browser-results.json')));
    const spoolId = fixture.spoolIds[0];
    const settings = async () => {
        const r = await fetch(state.url + 'api/settings', { headers: { 'X-Api-Key': state.apiKey } });
        assert(r.ok, `Phone test settings: ${r.status}`);
        const s = await r.json();
        assert.equal(s.appearance.name, 'QR Phone Test');
        return s;
    };
    const before = (await settings()).plugins.Spoolman.selectedSpoolIds;
    const url = Q.selectionUrl(state.url, '/', state.url, spoolId);
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const errors = [];
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
        page.on('pageerror', error => errors.push(error.message));
        let selections = 0;
        page.on('request', r => { if (r.method() === 'POST' && r.url().includes('/self/spool')) selections++; });
        await page.goto(url);
        await page.locator('#login-user').fill(state.username);
        await page.locator('#login-password').fill(state.password);
        await page.getByRole('button', { name: 'Log in', exact: true }).click();
        await page.waitForFunction(id => {
            const vm = window.ko && ko.dataFor(document.querySelector('#spoolman_qr_select'));
            return vm?.qr.spool()?.id === id && !vm.qr.loading() && getComputedStyle(document.querySelector('#spoolman_qr_select')).opacity === '1';
        }, spoolId);
        assert.equal(await page.evaluate(() => window.innerWidth), 390);
        assert((await page.locator('#spoolman_qr_select').innerText()).includes('QR Phone Test'));
        await page.screenshot({ path: path.join(output, 'phone-lan-confirmation.png') });
        await page.locator('#spoolman_qr_select').getByRole('button', { name: 'Cancel', exact: true }).click();
        assert.deepEqual((await settings()).plugins.Spoolman.selectedSpoolIds, before);

        await page.setViewportSize({ width: 1400, height: 1100 });
        await page.locator('#sidebar_spoolman button[title="Select spool"], #sidebar_spoolman button[title="Change Spool"]').first().click();
        await page.locator('#spoolman-modal-selectSpool-search').fill(String(spoolId));
        await page.locator('#spoolman-modal-selectSpool-search').press('ArrowRight');
        const row = page.locator('#spoolman_modal_selectspool tbody tr').filter({ has: page.locator('td:first-child span', { hasText: new RegExp(`^${spoolId}$`) }) });
        await row.getByRole('button', { name: 'Print in Spoolman', exact: true }).click();
        const template = Q.selectionUrlTemplate(state.url, '/', state.url);
        assert.equal(await page.locator('#spoolman-qr-template').inputValue(), template);
        const printingUrl = await page.locator('#spoolman_qr_print').getByRole('link', { name: 'Open Spoolman printing' }).getAttribute('href');
        assert.equal(printingUrl, `http://127.0.0.1:7181/labels?spools=${spoolId}`);
        await page.screenshot({ path: path.join(output, 'phone-printing-handoff.png') });
        assert.equal(selections, 0);
        assert.deepEqual((await settings()).plugins.Spoolman.selectedSpoolIds, before);
        assert.deepEqual(errors, []);
        await fs.writeFile(path.join(output, 'phone-acceptance.json'), JSON.stringify({
            url, template, printingUrl, spoolId, printer: 'QR Phone Test', selectionUnchanged: true,
            localBrowserPassed: true, physicalPrintVerified: false, phoneCameraVerified: false,
        }, null, 2));
        console.log(`Ready to scan: ${url}\nPASS real LAN URL login, preview, cancellation, unchanged selection and Spoolman printing handoff\nNo physical print or phone-camera result claimed.`);
    } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
