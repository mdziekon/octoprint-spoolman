const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Q = require('../octoprint_Spoolman/static/js/common/qr.js');

function observable(value) {
    const result = (...args) => args.length ? (value = args[0]) : value;
    result.subscribe = () => {};
    return result;
}
function harness(origin = 'http://prusaprint.local', lookup) {
    const events = new Map(), handlers = new Map(), models = [], calls = [];
    const config = { qrCodeBaseUrl: observable(''), spoolmanUrl: observable('http://inventory.local/'), spoolmanWebUrl: observable('') };
    const $ = arg => {
        if (typeof arg === 'function') return arg();
        return { on: (name, callback) => { handlers.set(`${arg}:${name}`, callback); return $(arg); }, modal: () => {} };
    };
    vm.runInNewContext(fs.readFileSync(require.resolve('../octoprint_Spoolman/static/js/Spoolman_qr.js'), 'utf8'), {
        $, SpoolmanQr: Q, URL, AbortController, setTimeout, clearTimeout,
        BASEURL: '/octo/', OCTOPRINT_VIEWMODELS: models,
        window: { location: { origin, host: new URL(origin).host, search: '' } },
        document: { querySelector: () => ({}), addEventListener: (name, callback) => events.set(name, callback) },
        ko: { observable, observableArray: observable, pureComputed: fn => fn, unwrap: value => typeof value === 'function' ? value() : value },
        OctoPrint: { getCookie: () => 'test-csrf' },
        fetch: async (url, options) => { calls.push({ url: url.href, method: options.method || 'GET' }); return lookup(url, options); },
    });
    const settings = { settings: { plugins: { Spoolman: config }, appearance: { name: observable('Test printer') } }, printerProfiles: { currentProfileData: () => ({ name: 'Test printer', extruder: { count: 1 } }) } };
    const model = new models[0].construct([settings, { loggedIn: () => true, hasPermission: () => true }, { isPrinting: () => false, isPaused: () => false }, { permissions: { CONTROL: 'CONTROL' } }]);
    model.onAfterBinding();
    return { model, config, calls, open: id => events.get('spoolman:print-labels')({ detail: { id, filament: { name: 'PLA' } } }), close: () => handlers.get('#spoolman_qr_print:hide')() };
}
const response = (hostname = 'prusaprint.local', ipAddress = '192.168.0.81') => ({ ok: true, status: 200, json: async () => ({ data: { hostname, ipAddress } }) });

test('the copy dialog automatically replaces .local with the machine IP', async () => {
    let finish;
    const h = harness(undefined, () => new Promise(resolve => { finish = resolve; }));
    const opened = h.open(11);
    assert.equal(h.model.printing.loading(), true);
    assert.equal(h.model.printing.template(), '');
    finish(response());
    await opened;
    assert.equal(h.model.printing.template(), 'http://192.168.0.81/octo/?spoolman_spool={id}');
    assert.equal(h.model.printing.url(), 'http://inventory.local/labels?spools=11');
    assert.equal(h.model.printing.loading(), false);
    assert.deepEqual(h.calls, [{ url: 'http://prusaprint.local/octo/plugin/Spoolman/self/qr-address', method: 'GET' }]);
});

test('opening by IP requires no extra server request', async () => {
    const h = harness('http://192.168.0.81:5000', () => { throw new Error('Unexpected lookup'); });
    await h.open(11);
    assert.equal(h.model.printing.template(), 'http://192.168.0.81:5000/octo/?spoolman_spool={id}');
    assert.deepEqual(h.calls, []);
});

test('failed discovery leaves no hostname template available to copy', async () => {
    const h = harness(undefined, async () => ({ ok: false, status: 503, json: async () => ({ error: { message: 'Check the printer network connection and retry.' } }) }));
    await h.open(11);
    assert.equal(h.model.printing.template(), '');
    assert.match(h.model.printing.error(), /network connection/);
    assert.equal(h.model.printing.loading(), false);
});

test('an old lookup cannot replace a newly opened spool dialog', async () => {
    let finish;
    const h = harness(undefined, () => new Promise(resolve => { finish = resolve; }));
    const old = h.open(11);
    h.close();
    h.config.qrCodeBaseUrl('http://192.168.0.82/');
    await h.open(12);
    finish(response());
    await old;
    assert.equal(h.model.printing.template(), 'http://192.168.0.82/?spoolman_spool={id}');
    assert.equal(h.model.printing.spool(), '#12 · PLA');
    assert.equal(h.model.printing.error(), '');
});

test('a concurrent settings change does not copy an IP for another host', async () => {
    const h = harness(undefined, async () => response('other-printer.local', '192.168.0.82'));
    await h.open(11);
    assert.equal(h.model.printing.template(), '');
    assert.match(h.model.printing.error(), /settings changed/);
});
