"""Start/stop an isolated virtual OctoPrint instance for a real phone scan.

The automated stack stays localhost-only. This instance binds to one explicitly
chosen private LAN address and uses fresh credentials, never the public fixture
password. All generated configuration and credentials stay in ignored storage.
"""
import argparse
import http.client
import ipaddress
import json
from pathlib import Path
import secrets
import subprocess
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "docker-data" / "qr-phone"
STATE = DATA / "session.json"
COMPOSE = DATA / "compose.json"
PROJECT = "spoolman-qr-phone"


def command(*args):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        # Do not include the argv: the one-off user creation contains a password.
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "Command failed")
    return result.stdout


def compose(*args):
    return command("docker", "compose", "-p", PROJECT, "-f", str(COMPOSE), *args)


def read_api(url, key):
    request = urllib.request.Request(url, headers={"X-Api-Key": key})
    with urllib.request.urlopen(request, timeout=3) as response:
        return json.load(response)


def private_address(value):
    address = ipaddress.IPv4Address(value)
    ranges = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]
    if not any(address in ipaddress.IPv4Network(network) for network in ranges):
        raise argparse.ArgumentTypeError("Use this computer's private Wi-Fi/Ethernet IPv4 address")
    return str(address)


def start(host, port):
    fixture = read_api("http://127.0.0.1:7180/api/settings", "QR_TEST_ONLY_DO_NOT_USE_IN_PRODUCTION")
    if fixture.get("appearance", {}).get("name") != "QR Test Printer":
        raise RuntimeError("Start tests/compose.qr.yaml first; refusing to use a different inventory environment")
    command("docker", "network", "inspect", "spoolman-qr_default", "--format", "{{.Name}}")
    DATA.mkdir(parents=True, exist_ok=True, mode=0o700)
    DATA.chmod(0o700)
    if STATE.exists():
        state = json.loads(STATE.read_text())
        if state["host"] != host or state["port"] != port:
            raise RuntimeError("This test already has a different address; stop it and archive docker-data/qr-phone before creating new labels")
    else:
        state = {
            "host": host, "port": port, "url": f"http://{host}:{port}/",
            "apiKey": secrets.token_hex(24), "ownerPassword": secrets.token_urlsafe(18),
            "username": "qr-phone", "password": secrets.token_urlsafe(12),
        }
        STATE.write_text(json.dumps(state, indent=2))
        STATE.chmod(0o600)
    octo = DATA / "octoprint"
    octo.mkdir(exist_ok=True)
    config = octo / "config.yaml"
    if not config.exists():
        config.write_text(json.dumps({
            "api": {"key": state["apiKey"]},
            "appearance": {"name": "QR Phone Test"},
            "server": {"firstRun": False, "onlineCheck": {"enabled": False}, "pluginBlacklist": {"enabled": False}},
            "plugins": {
                "_disabled": ["softwareupdate", "announcements"],
                "Spoolman": {"spoolmanUrl": "http://spoolman:8000", "spoolmanWebUrl": "http://127.0.0.1:7181/", "qrCodeBaseUrl": state["url"]},
                "virtual_printer": {"enabled": True}, "tracking": {"enabled": False},
            },
            "serial": {"port": "VIRTUAL", "baudrate": 115200, "autoconnect": True},
        }, indent=2))
        config.chmod(0o600)
    COMPOSE.write_text(json.dumps({
        "services": {"phone": {
            "image": "octoprint/octoprint:1.11.7",
            "ports": [f"{host}:{port}:80"],
            "volumes": [
                f"{octo}:/octoprint/octoprint",
                f"{ROOT / 'octoprint_Spoolman'}:/octoprint/octoprint/plugins/Spoolman:ro",
            ],
            "networks": ["inventory"],
        }},
        "networks": {"inventory": {"external": True, "name": "spoolman-qr_default"}},
    }, indent=2))
    if not state.get("accountsReady"):
        print("Creating private phone-test accounts…", flush=True)
        created = set(state.get("createdAccounts", []))
        for username, password, groups in [
            ("qr-owner", state["ownerPassword"], ["--admin"]),
            (state["username"], state["password"], ["--group", "users"]),
        ]:
            if username in created:
                continue
            compose("run", "--rm", "--no-deps", "--entrypoint", "octoprint", "phone",
                    "--basedir", "/octoprint/octoprint", "user", "add", username, "--password", password, *groups)
            created.add(username)
            state["createdAccounts"] = sorted(created)
            STATE.write_text(json.dumps(state, indent=2))
        state["accountsReady"] = True
        STATE.write_text(json.dumps(state, indent=2))
    print("Starting the isolated virtual printer…", flush=True)
    compose("up", "-d")
    deadline = time.monotonic() + 90
    while True:
        try:
            settings = read_api(state["url"] + "api/settings", state["apiKey"])
            if settings["appearance"]["name"] != "QR Phone Test":
                raise RuntimeError("Unexpected server at the phone test address")
            break
        except (OSError, http.client.HTTPException):
            if time.monotonic() >= deadline:
                raise RuntimeError("The phone test did not become ready; inspect its Docker logs") from None
            time.sleep(1)
    guide = DATA / "PHONE-TEST.md"
    guide.write_text(f"""# Phone acceptance test

Open [{state['url']}]({state['url']}) on the phone using the same Wi-Fi as this Mac.

- Username: `{state['username']}`
- Password: `{state['password']}`
- Target printer: **QR Phone Test** (virtual; no physical 3D printer)

On the Mac, open OctoPrint's spool list and click **Print in Spoolman** for the
test spool. Copy the generic QR URL template and open Spoolman printing. If this
test instance predates the printing link, set its **Spoolman Web interface URL**
to `http://127.0.0.1:7181/` first. Spoolman remains accessible only on the Mac.

Choose a **Spool** design. In **Design**, select the QR element, choose **Custom
URL**, and paste `{state['url']}?spoolman_spool={{id}}`. Keep the literal `{{id}}`.
Save the design, select the test spool in **Print**, and choose **Label printer**
with one copy. Match the design dimensions and Chrome paper size to the stock
physically loaded in the DYMO. Print at 100%, with headers and footers disabled,
after checking the preview shows exactly one page with complete content.

Scan the printed label with the phone camera. Check the spool and printer, cancel
once, then scan again and confirm. Confirm that exactly one label was used and all
text and the full QR code are visible. Report the stock number and results.

The accounts and configuration are local test data. The normal automated test
instance remains on localhost. Stop this LAN instance when finished:

```sh
python3 tests/phone-acceptance.py stop
```
""")
    guide.chmod(0o600)
    print(f"Ready: {state['url']}\nPhone login and steps: {guide}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    launch = sub.add_parser("start")
    launch.add_argument("--host", required=True, type=private_address)
    launch.add_argument("--port", type=int, default=7182)
    sub.add_parser("stop")
    sub.add_parser("status")
    args = parser.parse_args()
    if args.action == "start":
        if not 1024 <= args.port <= 65535:
            parser.error("Use a port from 1024 to 65535")
        start(args.host, args.port)
    elif COMPOSE.exists():
        print(compose("down" if args.action == "stop" else "ps"))
    else:
        print("No phone acceptance instance has been prepared")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, urllib.error.URLError) as error:
        raise SystemExit(str(error)) from None
