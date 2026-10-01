const { test } = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../octoprint_Spoolman/static/js/common/qr.js');

test('one literal template works for every spool and preserves proxy prefixes', () => {
    const template = Q.selectionUrlTemplate('', '/printer/', 'http://prusaprint.local:5000', '192.168.0.81');
    assert.equal(template, 'http://192.168.0.81:5000/printer/?spoolman_spool={id}');
    assert(!template.includes('%7B'));
    for (const id of [4, 42, 123]) {
        const url = new URL(template.replace('{id}', String(id)));
        assert.equal(Q.pendingSpool(url.search), String(id));
        assert.equal(url.href, Q.selectionUrl('', '/printer/', 'http://prusaprint.local:5000', id, '192.168.0.81'));
    }
});

test('phone-accessible override replaces the browser address and keeps its path', () => {
    assert.equal(Q.selectionUrlTemplate(' http://printer.local/octo ', '/', 'https://lab.test', '192.168.0.81'), 'http://192.168.0.81/octo/?spoolman_spool={id}');
    assert.equal(Q.selectionUrlTemplate(' ', '/octo/', 'https://lab.test', '192.168.0.81'), 'https://192.168.0.81/octo/?spoolman_spool={id}');
    assert.equal(Q.selectionUrlTemplate('http://[fd00::1]:5000/octo/', '/', 'https://lab.test'), 'http://[fd00::1]:5000/octo/?spoolman_spool={id}');
});

test('numeric addresses are copied unchanged without a lookup', () => {
    assert.equal(Q.selectionUrlTemplate('', '/', 'http://192.168.0.81'), 'http://192.168.0.81/?spoolman_spool={id}');
    assert.equal(Q.selectionUrlTemplate('http://192.168.0.82:7182/octo/', '/', 'http://printer.local', '192.168.0.81'), 'http://192.168.0.82:7182/octo/?spoolman_spool={id}');
    assert.equal(Q.selectionUrlTemplate('', '/', 'http://127.0.0.1:7180'), 'http://127.0.0.1:7180/?spoolman_spool={id}');
});

test('resolved IPv6 addresses are bracketed and retain the port and proxy path', () => {
    assert.equal(Q.selectionUrlTemplate('', '/octo/', 'https://printer.local:8443', 'fd00::81'), 'https://[fd00::81]:8443/octo/?spoolman_spool={id}');
});

test('failed discovery cannot silently produce another hostname-based label', () => {
    for (const address of [undefined, '', 'printer.local', 'not an address', '192.168.0.999', '192.168.0.81:5000', '192.168.0.81/path', 'user@192.168.0.81']) {
        assert.throws(() => Q.selectionUrlTemplate('', '/', 'http://prusaprint.local', address), /IP address/);
    }
});

test('templates reject credentials, queries, fragments and non-HTTP addresses', () => {
    for (const url of ['printer.local', '/printer/', 'javascript:alert(1)', 'https://user:key@lab.test', 'https://lab.test/?apikey=x', 'https://lab.test/#tab']) {
        assert.throws(() => Q.selectionUrlTemplate(url, '/', 'https://lab.test', '192.168.0.81'));
    }
});

test('pending spool is absent, valid, or invalid; duplicate parameters are rejected', () => {
    assert.equal(Q.pendingSpool('?other=1'), undefined);
    assert.equal(Q.pendingSpool('?spoolman_spool=42'), '42');
    for (const query of ['?spoolman_spool=', '?spoolman_spool=-1', '?spoolman_spool={id}', '?spoolman_spool=1&spoolman_spool=2']) assert.equal(Q.pendingSpool(query), null);
    for (const id of [0, -1, true, '4/5', '1e2', '1'.repeat(16)]) assert.throws(() => Q.selectionUrl('', '/', 'https://lab.test', id));
});

test('printing uses the browser-facing Spoolman URL and preselects only the requested spool', () => {
    assert.equal(Q.printingUrl('https://inventory.test/proxy', 'http://spoolman:8000', 42), 'https://inventory.test/proxy/labels?spools=42');
    assert.equal(Q.printingUrl(' ', 'https://inventory.test/', 4), 'https://inventory.test/labels?spools=4');
    assert.equal(Q.printingUrl('', 'https://inventory.test/proxy/', 4), 'https://inventory.test/proxy/labels?spools=4');
});

test('invalid printing addresses and IDs cannot produce a navigation link', () => {
    for (const url of ['', '/inventory', 'javascript:alert(1)', 'https://key@lab.test', 'https://lab.test/?token=x', 'https://lab.test/#label']) {
        assert.throws(() => Q.printingUrl(url, '', 4));
    }
    assert.throws(() => Q.printingUrl('https://inventory.test', '', '4,5'));
    // An invalid explicit web URL must not fall back to an internal server URL.
    assert.throws(() => Q.printingUrl('not a URL', 'http://spoolman:8000', 4));
});
