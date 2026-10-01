// Run only against tests/compose.qr.yaml. All writes target disposable local data.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const OCTO = 'http://127.0.0.1:7180/';
const SPOOL = 'http://127.0.0.1:7181/api/v1/';
const WEB = OCTO;
const KEY = 'QR_TEST_ONLY_DO_NOT_USE_IN_PRODUCTION';
const output = path.join(__dirname, 'output');
const checks = [];
function passed(name) { checks.push(name); console.log(`PASS ${name}`); }
async function api(base, route, method = 'GET', body) {
    const r = await fetch(new URL(route, base), {
        method, headers: { 'Content-Type': 'application/json', ...(base === OCTO ? { 'X-Api-Key': KEY } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await r.text();
    assert(r.ok, `${method} ${route}: ${r.status} ${text}`);
    return text ? JSON.parse(text) : undefined;
}
const octo = (r, m, b) => api(OCTO, r, m, b);
const spool = (r, m, b) => api(SPOOL, r, m, b);
const selected = async () => (await octo('api/settings')).plugins.Spoolman.selectedSpoolIds;
async function sessionRequest(page, route, body) {
    return page.evaluate(async ({ route, body }) => {
        const r = await fetch(new URL(route, location.origin + BASEURL), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': OctoPrint.getCookie('csrf_token') }, body: JSON.stringify(body) });
        return { status: r.status, text: await r.text() };
    }, { route, body });
}
async function waitForState(state) {
    const end = Date.now() + 30000;
    while (Date.now() < end) {
        if ((await octo('api/job')).state === state) return;
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`Virtual printer did not reach ${state}`);
}
async function ready(page) {
    await page.waitForFunction(() => {
        const el = document.querySelector('#sidebar_spoolman');
        return window.ko && el && ko.dataFor(el) && !ko.dataFor(el).templateData.isLoadingData();
    });
}
async function login(page, route = '', user = 'qrtest', password = 'qr-test-local-only') {
    await page.goto(WEB + route);
    if (await page.locator('#login-user').count()) {
        await page.locator('#login-user').fill(user);
        await page.locator('#login-password').fill(password);
        await page.getByRole('button', { name: 'Log in', exact: true }).click();
    }
    await ready(page);
}
async function qrReady(page) {
    await page.waitForFunction(() => {
        const el = document.querySelector('#spoolman_qr_select');
        const vm = el && ko.dataFor(el);
        return vm && vm.qr.spool() && !vm.qr.loading() && getComputedStyle(el).opacity === '1';
    });
    // OctoPrint's unrelated update toast can cover the phone dialog.
    await page.evaluate(() => PNotify.removeAll());
    await page.waitForFunction(() => !$('.ui-pnotify').is(':visible'));
}
async function run() {
    await fs.mkdir(output, { recursive: true });
    assert.equal((await octo('api/settings')).appearance.name, 'QR Test Printer', 'Refusing to seed a non-test OctoPrint instance');
    await octo('api/settings', 'POST', { plugins: { Spoolman: { spoolmanWebUrl: 'http://127.0.0.1:7181/', qrCodeBaseUrl: WEB } } });
    await octo('api/printerprofiles/_default', 'PATCH', { profile: { extruder: { count: 1 } } });
    await octo('plugin/Spoolman/self/spool', 'POST', { toolIdx: 0 });
    const vendor = await spool('vendor', 'POST', { name: 'QR fixture maker' });
    const filament = await spool('filament', 'POST', { name: 'Ocean blue PLA', material: 'PLA', density: 1.24, diameter: 1.75, weight: 1000, color_hex: '0066cc', vendor_id: vendor.id });
    const first = await spool('spool', 'POST', { filament_id: filament.id, remaining_weight: 640, lot_nr: 'LOT-42' });
    const second = await spool('spool', 'POST', { filament_id: filament.id, remaining_weight: 480 });
    const archived = await spool('spool', 'POST', { filament_id: filament.id, remaining_weight: 200, archived: true });
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const errors = [];
    const capture = page => page.on('pageerror', e => errors.push(e.message));
    try {
        const desktop = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
        const dashboard = await desktop.newPage(); capture(dashboard);
        await login(dashboard);
        const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 1 });
        const phone = await mobile.newPage(); capture(phone);
        let phonePosts = 0;
        phone.on('request', r => { if (r.method() === 'POST' && r.url().includes('/self/spool/qr')) phonePosts++; });
        await login(phone, `?spoolman_spool=${first.id}`);
        await qrReady(phone);
        assert(phone.url().includes(`spoolman_spool=${first.id}`));
        assert.equal((await selected())['0'].spoolId, null);
        assert.equal(phonePosts, 0);
        assert.equal(await phone.evaluate(() => window.innerWidth), 390, 'QR dialog must use the phone viewport');
        await phone.screenshot({ path: path.join(output, 'phone-confirmation.png') });
        passed('login continuation and scan preview never select a spool');

        const noCsrf = await phone.evaluate(async id => (await fetch('plugin/Spoolman/self/spool/qr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toolIdx: 0, spoolId: String(id) }) })).status, first.id);
        assert.equal(noCsrf, 400);
        assert.equal((await selected())['0'].spoolId, null);
        passed('real OctoPrint rejects a session POST without its CSRF token');

        await phone.locator('#spoolman_qr_select').getByRole('button', { name: 'Use this spool', exact: true }).click();
        await phone.waitForFunction(() => !!ko.dataFor(document.querySelector('#spoolman_qr_select')).qr.success());
        assert.equal((await selected())['0'].spoolId, String(first.id));
        assert.equal(phonePosts, 2); // one deliberately rejected CSRF request, one confirmed request
        await dashboard.waitForFunction(id => ko.dataFor(document.querySelector('#sidebar_spoolman')).templateData.selectedSpoolsByToolIdx()[0]?.spoolId === String(id), first.id);
        assert(!phone.url().includes('spoolman_spool'));
        passed('phone confirmation persists and updates the other dashboard');

        await phone.goto(WEB + `?spoolman_spool=${second.id}`); await ready(phone); await qrReady(phone);
        await phone.locator('#spoolman_qr_select').getByRole('button', { name: 'Cancel', exact: true }).click();
        assert.equal((await selected())['0'].spoolId, String(first.id));
        assert(!phone.url().includes('spoolman_spool'));
        await phone.goto(WEB + `?spoolman_spool=${first.id}`); await ready(phone); await qrReady(phone);
        assert((await phone.locator('#spoolman_qr_select').innerText()).includes(`#${first.id}`));
        passed('cancellation and repeat scans retain the correct spool');

        await octo('api/printerprofiles/_default', 'PATCH', { profile: { extruder: { count: 2 } } });
        await phone.goto(WEB + `?spoolman_spool=${second.id}`); await ready(phone); await qrReady(phone);
        assert.equal(await phone.locator('#spoolman-qr-tool').inputValue(), '');
        assert(await phone.locator('#spoolman_qr_select').getByRole('button', { name: 'Use this spool', exact: true }).isDisabled());
        await phone.locator('#spoolman-qr-tool').selectOption({ label: 'Extruder 2 (tool 1)' });
        await phone.locator('#spoolman_qr_select').getByRole('button', { name: 'Use this spool', exact: true }).click();
        await phone.waitForFunction(() => !!ko.dataFor(document.querySelector('#spoolman_qr_select')).qr.success());
        const tools = await selected();
        assert.equal(tools['0'].spoolId, String(first.id)); assert.equal(tools['1'].spoolId, String(second.id));
        passed('multi-extruder selection requires an explicit target and preserves other tools');
        await octo('api/printerprofiles/_default', 'PATCH', { profile: { extruder: { count: 1 } } });

        for (const id of [archived.id, '999999999', 'invalid']) {
            await phone.goto(WEB + `?spoolman_spool=${id}`); await ready(phone);
            await phone.waitForFunction(() => !!ko.dataFor(document.querySelector('#spoolman_qr_select')).qr.error());
            assert(await phone.locator('#spoolman_qr_select').getByRole('button', { name: 'Use this spool', exact: true }).isDisabled());
        }
        passed('archived, deleted and invalid labels cannot select a spool');

        // Load while idle, then start the virtual print after the user clicks but
        // before the POST reaches OctoPrint. This tests the server-side recheck.
        await phone.goto(WEB + `?spoolman_spool=${second.id}`); await ready(phone); await qrReady(phone);
        const file = new FormData();
        file.append('file', new Blob(['G90\n' + 'G4 P500\n'.repeat(200)]), 'qr-state-test.gcode');
        const upload = await fetch(OCTO + 'api/files/local', { method: 'POST', headers: { 'X-Api-Key': KEY }, body: file });
        assert(upload.ok, await upload.text());
        await phone.route('**/self/spool/qr', async route => {
            await octo('api/files/local/qr-state-test.gcode', 'POST', { command: 'select', print: true });
            await waitForState('Printing');
            await route.continue();
        });
        await phone.locator('#spoolman_qr_select').getByRole('button', { name: 'Use this spool', exact: true }).click();
        await phone.waitForFunction(() => ko.dataFor(document.querySelector('#spoolman_qr_select')).qr.error().includes('print'));
        await phone.unroute('**/self/spool/qr');
        assert.equal((await selected())['0'].spoolId, String(first.id));
        await octo('api/job', 'POST', { command: 'pause', action: 'pause' }); await waitForState('Paused');
        const paused = await sessionRequest(phone, 'plugin/Spoolman/self/spool/qr', { toolIdx: 0, spoolId: String(second.id) });
        assert.equal(paused.status, 409); assert(paused.text.includes('qr_printer_busy'));
        assert.equal((await selected())['0'].spoolId, String(first.id));
        await phone.screenshot({ path: path.join(output, 'paused-rejection.png') });
        await octo('api/job', 'POST', { command: 'cancel' }); await waitForState('Operational');
        passed('a job starting after confirmation and paused jobs are rejected without changing selection');

        for (const [user, groups] of [['qrreadonly', ['readonly']], ['qroperator', ['users']]]) {
            const created = await sessionRequest(dashboard, 'api/access/users', { name: user, password: 'qr-test-local-only', active: true, groups });
            assert([200, 201, 409].includes(created.status), created.text);
            const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
            const page = await context.newPage(); capture(page);
            await login(page, `?spoolman_spool=${second.id}`, user); await qrReady(page);
            const button = page.locator('#spoolman_qr_select').getByRole('button', { name: 'Use this spool', exact: true });
            if (user === 'qrreadonly') {
                assert(await button.isDisabled());
                assert.equal((await sessionRequest(page, 'plugin/Spoolman/self/spool/qr', { toolIdx: 0, spoolId: String(second.id) })).status, 403);
                assert.equal((await selected())['0'].spoolId, String(first.id));
            } else {
                await button.click();
                await page.waitForFunction(() => !!ko.dataFor(document.querySelector('#spoolman_qr_select')).qr.success());
                assert.equal((await selected())['0'].spoolId, String(second.id));
            }
            await context.close();
        }
        await octo('plugin/Spoolman/self/spool', 'POST', { toolIdx: 0, spoolId: String(first.id) });
        passed('read-only accounts are denied and non-admin printer operators can confirm');

        await phone.goto(WEB + `?spoolman_spool=${second.id}`); await ready(phone); await qrReady(phone);
        await mobile.clearCookies();
        await phone.locator('#spoolman_qr_select').getByRole('button', { name: 'Use this spool', exact: true }).click();
        await phone.waitForFunction(() => !!ko.dataFor(document.querySelector('#spoolman_qr_select')).qr.error());
        assert.equal((await selected())['0'].spoolId, String(first.id));
        await phone.locator('#spoolman_qr_select').getByRole('button', { name: 'Log in', exact: true }).click();
        await phone.locator('#login-user').fill('qrtest'); await phone.locator('#login-password').fill('qr-test-local-only');
        await phone.getByRole('button', { name: 'Log in', exact: true }).click();
        await ready(phone); await qrReady(phone);
        assert(phone.url().includes(`spoolman_spool=${second.id}`));
        assert.equal((await selected())['0'].spoolId, String(first.id));
        passed('expired sessions can log in again with the scanned spool preserved');

        await phone.route('**/plugin/Spoolman/spoolman/spools', route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { code: 'spoolman_api__connection_failed' } }) }));
        await phone.goto(WEB + `?spoolman_spool=${second.id}`); await ready(phone);
        await phone.waitForFunction(() => ko.dataFor(document.querySelector('#spoolman_qr_select')).qr.error().includes('connection'));
        assert.equal((await selected())['0'].spoolId, String(first.id));
        await phone.unroute('**/plugin/Spoolman/spoolman/spools');
        await phone.locator('#spoolman_qr_select').getByRole('button', { name: 'Retry', exact: true }).click(); await qrReady(phone);
        passed('Spoolman connection errors allow a read-only retry');

        // Preparing another spool's label must not select it in OctoPrint.
        await octo('plugin/Spoolman/self/spool', 'POST', { toolIdx: 0, spoolId: String(second.id) });
        await dashboard.reload(); await ready(dashboard);
        let selectionPosts = 0;
        dashboard.on('request', r => { if (r.method() === 'POST' && r.url().includes('/self/spool')) selectionPosts++; });
        await dashboard.locator('#sidebar_spoolman button[title="Change Spool"]').first().click();
        await dashboard.locator('#spoolman-modal-selectSpool-search').fill(String(first.id));
        await dashboard.locator('#spoolman-modal-selectSpool-search').press('ArrowRight');
        const row = dashboard.locator('#spoolman_modal_selectspool tbody tr').filter({ has: dashboard.locator('td:first-child span', { hasText: new RegExp(`^${first.id}$`) }) });
        await row.getByRole('button', { name: 'Print in Spoolman', exact: true }).click();
        const printing = dashboard.locator('#spoolman_qr_print');
        await printing.waitFor({ state: 'visible' });
        const template = await dashboard.locator('#spoolman-qr-template').inputValue();
        assert.equal(template, WEB + '?spoolman_spool={id}');
        assert.equal(await dashboard.locator('#spoolman_label, #spoolman-label-stock').count(), 0);
        await printing.getByRole('button', { name: 'Copy URL template' }).click();
        await dashboard.waitForFunction(() => ko.dataFor(document.querySelector('#spoolman_qr_print')).printing.copyStatus() === 'Copied.');
        const link = printing.getByRole('link', { name: 'Open Spoolman printing' });
        assert.equal(await link.getAttribute('href'), `http://127.0.0.1:7181/labels?spools=${first.id}`);
        await dashboard.screenshot({ path: path.join(output, 'spoolman-printing.png') });
        const [labelPage] = await Promise.all([dashboard.waitForEvent('popup'), link.click()]);
        await labelPage.waitForLoadState();
        assert.equal(labelPage.url(), `http://127.0.0.1:7181/labels?spools=${first.id}`);
        assert.equal((await selected())['0'].spoolId, String(second.id));
        assert.equal(selectionPosts, 0);
        await labelPage.close();
        passed('printing handoff provides a literal template and opens Spoolman without selecting a spool');

        // Spoolman's custom QR encoding replaces {id}; use that exact contract.
        for (const item of [first, second]) {
            await phone.goto(template.replace('{id}', String(item.id))); await ready(phone); await qrReady(phone);
            assert((await phone.locator('#spoolman_qr_select').innerText()).includes(`#${item.id}`));
            await phone.locator('#spoolman_qr_select').getByRole('button', { name: 'Cancel', exact: true }).click();
            assert.equal((await selected())['0'].spoolId, String(second.id));
        }
        passed('the same template opens confirmation for different spools without changing selection');

        assert.deepEqual(errors, [], 'Browser script errors');
        passed('no browser JavaScript errors');
        await fs.writeFile(path.join(output, 'browser-results.json'), JSON.stringify({ checks, spoolIds: [first.id, second.id], browser: await browser.version() }, null, 2));
    } finally {
        const state = (await octo('api/job')).state;
        if (['Printing', 'Paused', 'Pausing'].includes(state)) await octo('api/job', 'POST', { command: 'cancel' });
        await octo('api/printerprofiles/_default', 'PATCH', { profile: { extruder: { count: 1 } } });
        await browser.close();
    }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
