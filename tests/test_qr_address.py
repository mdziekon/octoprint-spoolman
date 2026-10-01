import logging
import socket
import unittest
from unittest.mock import Mock, patch

from flask import Flask
from flask_login import LoginManager, UserMixin

from octoprint_Spoolman.modules.PluginAPI import PluginAPI


class User(UserMixin):
    id = "tester"


class QrAddressTests(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.secret_key = "isolated-test-only"
        login = LoginManager(self.app)
        login.request_loader(lambda request: User() if request.headers.get("X-Test-User") else None)
        self.plugin = PluginAPI()
        self.plugin._logger = logging.getLogger("qr-address-tests")
        self.plugin._settings = Mock()
        self.plugin._settings.get.return_value = ""
        self.plugin.triggerPluginEvent = Mock()
        self.permission = patch("octoprint_Spoolman.modules.PluginAPI.Permissions.STATUS.can", return_value=True).start()
        self.resolve = patch("octoprint_Spoolman.modules.PluginAPI.socket.getaddrinfo").start()
        self.interface = patch("octoprint_Spoolman.modules.PluginAPI.address_for_client", return_value="192.168.0.81").start()
        self.addCleanup(patch.stopall)
        self.app.add_url_rule("/qr-address", view_func=self.plugin.handleGetQrAddress, methods=["GET"])
        self.client = self.app.test_client()

    def addresses(self, *values):
        self.resolve.return_value = [(socket.AF_INET6 if ":" in value else socket.AF_INET, socket.SOCK_STREAM, 0, "", (value, 0)) for value in values]

    def get(self, logged_in=True):
        return self.client.get("/qr-address", base_url="http://prusaprint.local:5000", headers={"X-Test-User": "1"} if logged_in else {}, environ_overrides={"REMOTE_ADDR": "192.168.0.135"})

    def assert_unchanged(self):
        self.plugin._settings.set.assert_not_called()
        self.plugin._settings.save.assert_not_called()
        self.plugin.triggerPluginEvent.assert_not_called()

    def test_local_hostname_resolves_automatically_and_prefers_ipv4(self):
        self.addresses("fd00::81", "192.168.0.81")
        response = self.get()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {"data": {"hostname": "prusaprint.local", "ipAddress": "192.168.0.81"}})
        self.resolve.assert_called_once_with("prusaprint.local", None, type=socket.SOCK_STREAM)
        self.interface.assert_not_called()
        self.assert_unchanged()

    def test_ipv6_only_host_avoids_link_local_and_loopback_addresses(self):
        self.addresses("::1", "fe80::1", "fd00::81", "0.0.0.0", "224.0.0.1")
        self.assertEqual(self.get().json["data"]["ipAddress"], "fd00::81")
        self.assert_unchanged()

    def test_local_name_lookup_failure_uses_machine_interface(self):
        self.resolve.side_effect = socket.gaierror("Name unavailable")
        self.assertEqual(self.get().json["data"]["ipAddress"], "192.168.0.81")
        self.interface.assert_called_once_with("192.168.0.135", 80)
        self.assert_unchanged()

    def test_loopback_hostname_record_uses_machine_interface(self):
        self.addresses("127.0.1.1")
        self.assertEqual(self.get().json["data"]["ipAddress"], "192.168.0.81")
        self.interface.assert_called_once()

    def test_existing_override_for_this_instance_also_uses_interface_fallback(self):
        self.plugin._settings.get.return_value = "http://prusaprint.local/"
        self.resolve.side_effect = socket.gaierror("Name unavailable")
        self.assertEqual(self.get().json["data"]["ipAddress"], "192.168.0.81")
        self.interface.assert_called_once()

    def test_configured_proxy_hostname_is_resolved_separately(self):
        self.plugin._settings.get.return_value = " https://gateway.local:8443/octo/ "
        self.addresses("192.168.0.10")
        self.assertEqual(self.get().json["data"], {"hostname": "gateway.local", "ipAddress": "192.168.0.10"})
        self.resolve.assert_called_once_with("gateway.local", None, type=socket.SOCK_STREAM)
        self.assert_unchanged()

    def test_unresolvable_explicit_proxy_is_not_replaced_by_the_wrong_machine(self):
        self.plugin._settings.get.return_value = "https://gateway.local/octo/"
        self.resolve.side_effect = socket.gaierror("Name unavailable")
        self.assertEqual(self.get().status_code, 503)
        self.interface.assert_not_called()
        self.assert_unchanged()

    def test_discovery_failure_gives_an_actionable_error(self):
        self.resolve.side_effect = socket.gaierror("Name unavailable")
        for address in [None, "127.0.0.1", "0.0.0.0", "fe80::1"]:
            self.interface.return_value = address
            response = self.get()
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json["error"]["code"], "qr_address_unavailable")
        self.assert_unchanged()

    def test_requires_login_and_status_permission_before_discovery(self):
        self.assertEqual(self.get(logged_in=False).status_code, 403)
        self.permission.return_value = False
        self.assertEqual(self.get().status_code, 403)
        self.resolve.assert_not_called()
        self.interface.assert_not_called()
        self.assert_unchanged()

    def test_invalid_override_is_rejected_without_network_access(self):
        for url in ["/octo/", "javascript:alert(1)", "http://user:secret@printer.local", "http://printer.local:invalid", "http://printer.local/?token=x", "http://printer.local/#tab"]:
            self.plugin._settings.get.return_value = url
            self.assertEqual(self.get().status_code, 400)
        self.resolve.assert_not_called()
        self.interface.assert_not_called()
        self.assert_unchanged()


if __name__ == "__main__":
    unittest.main()
