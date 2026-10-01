import logging
import unittest
from unittest.mock import Mock, patch

from flask import Flask
from flask_login import LoginManager, UserMixin
from octoprint.events import Events

from octoprint_Spoolman.modules.PluginAPI import PluginAPI
from octoprint_Spoolman.modules.SpoolmanConnector import SpoolmanConnector


class User(UserMixin):
    id = "tester"


class QrApiTests(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.secret_key = "isolated-test-only"
        login = LoginManager(self.app)
        login.request_loader(lambda request: User() if request.headers.get("X-Test-User") else None)
        self.plugin = PluginAPI()
        self.plugin._logger = logging.getLogger("qr-tests")
        self.plugin._settings = Mock()
        self.plugin._settings.get.return_value = {"0": {"spoolId": "9"}}
        self.plugin.triggerPluginEvent = Mock()
        self.plugin._printer = Mock()
        self.plugin._printer.is_printing.return_value = False
        self.plugin._printer.is_paused.return_value = False
        self.plugin._printer.get_state_id.return_value = "OPERATIONAL"
        self.plugin._printer_profile_manager = Mock()
        self.plugin._printer_profile_manager.get_current_or_default.return_value = {"extruder": {"count": 2}}
        self.spool = {"id": 4, "archived": False, "remaining_weight": 200, "filament": {"density": 1.24, "diameter": 1.75}}
        self.connector = Mock()
        self.connector.handleGetSpool.return_value = {"data": {"spool": self.spool}}
        self.plugin.getSpoolmanConnector = lambda: self.connector
        self.permission = patch("octoprint_Spoolman.modules.PluginAPI.Permissions.CONTROL.can", return_value=True).start()
        self.addCleanup(patch.stopall)
        # Event registration normally happens during OctoPrint plugin loading.
        Events.PLUGIN_SPOOLMAN_SPOOL_SELECTED = "plugin_Spoolman_spool_selected"
        self.app.add_url_rule("/qr", view_func=self.plugin.handleSelectSpoolFromQr, methods=["POST"])
        self.app.add_url_rule("/manual", view_func=self.plugin.handleUpdateActiveSpool, methods=["POST"])
        self.client = self.app.test_client()

    def post(self, data=None, logged_in=True):
        return self.client.post("/qr", json=data if data is not None else {"toolIdx": 0, "spoolId": "4"}, headers={"X-Test-User": "1"} if logged_in else {})

    def assert_unchanged(self):
        self.plugin._settings.set.assert_not_called()
        self.plugin._settings.save.assert_not_called()
        self.plugin.triggerPluginEvent.assert_not_called()

    def test_success_persists_and_broadcasts_normalized_id(self):
        self.assertEqual(self.post({"toolIdx": 1, "spoolId": 4}).status_code, 200)
        self.plugin._settings.save.assert_called_once()
        self.assertEqual(self.plugin._settings.set.call_args.args[1], {"0": {"spoolId": "9"}, "1": {"spoolId": "4"}})
        self.plugin.triggerPluginEvent.assert_called_once_with(Events.PLUGIN_SPOOLMAN_SPOOL_SELECTED, {"toolIdx": 1, "spoolId": "4"})

    def test_anonymous_and_read_only_are_rejected(self):
        self.assertEqual(self.post(logged_in=False).status_code, 403)
        self.permission.return_value = False
        self.assertEqual(self.post().status_code, 403)
        self.assert_unchanged()
        self.connector.handleGetSpool.assert_not_called()

    def test_invalid_json_and_identifiers(self):
        for data in [[], {}, {"toolIdx": 0, "spoolId": True}, {"toolIdx": True, "spoolId": 4},
                     {"toolIdx": -1, "spoolId": 4}, {"toolIdx": 0.5, "spoolId": 4},
                     {"toolIdx": 0, "spoolId": "4/5"}, {"toolIdx": 0, "spoolId": 0},
                     {"toolIdx": 0, "spoolId": "1" * 16}, {"toolIdx": 2, "spoolId": 4}]:
            with self.subTest(data=data):
                self.assertEqual(self.post(data).status_code, 400)
        self.assert_unchanged()

    def test_printing_paused_and_transitional_states(self):
        for state in ["STARTING", "PAUSING", "RESUMING", "CANCELLING", "FINISHING"]:
            self.plugin._printer.get_state_id.return_value = state
            self.assertEqual(self.post().status_code, 409)
        self.plugin._printer.get_state_id.return_value = "OPERATIONAL"
        self.plugin._printer.is_printing.return_value = True
        self.assertEqual(self.post().status_code, 409)
        self.plugin._printer.is_printing.return_value = False
        self.plugin._printer.is_paused.return_value = True
        self.assertEqual(self.post().status_code, 409)
        self.assert_unchanged()

    def test_print_starts_while_spoolman_is_loading(self):
        self.plugin._printer.is_printing.side_effect = [False, True]
        self.assertEqual(self.post().status_code, 409)
        self.assert_unchanged()

    def test_profile_changes_while_spoolman_is_loading(self):
        self.plugin._printer_profile_manager.get_current_or_default.side_effect = [{"extruder": {"count": 2}}, {"extruder": {"count": 1}}]
        self.assertEqual(self.post({"toolIdx": 1, "spoolId": 4}).status_code, 409)
        self.assert_unchanged()

    def test_missing_archived_incomplete_and_wrong_spool(self):
        self.connector.handleGetSpool.return_value = {"error": {"code": "spoolman_api__spool_not_found"}}
        self.assertEqual(self.post().status_code, 404)
        for changes in [{"archived": True}, {"remaining_weight": None}, {"remaining_weight": float("nan")}, {"filament": {}}, {"filament": ["malformed"]}, {"id": 5}]:
            self.connector.handleGetSpool.return_value = {"data": {"spool": {**self.spool, **changes}}}
            self.assertEqual(self.post().status_code, 409)
        self.assert_unchanged()

    def test_spoolman_failure_preserves_selection(self):
        self.connector.handleGetSpool.return_value = {"error": {"code": "spoolman_api__connection_timeout"}}
        self.assertEqual(self.post().status_code, 503)
        self.assert_unchanged()

    def test_legacy_selection_and_deselection_are_compatible(self):
        for data in [{"toolIdx": 0, "spoolId": 4}, {"toolIdx": 0}]:
            response = self.client.post("/manual", json=data)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json, {"data": {}})


class ConnectorTests(unittest.TestCase):
    def test_lookup_uses_configured_auth_tls_and_timeout(self):
        connector = SpoolmanConnector("https://spoolman.example/", logging.getLogger("test"), "/test-ca.pem", "X-Api-Key", "test-key")
        with patch("requests.get") as get:
            get.return_value.status_code = 200
            get.return_value.json.return_value = {"id": 4}
            self.assertEqual(connector.handleGetSpool("4"), {"data": {"spool": {"id": 4}}})
            get.assert_called_once_with("https://spoolman.example/api/v1/spool/4", verify="/test-ca.pem", headers={"X-Api-Key": "test-key"}, timeout=5)

    def test_non_json_response_is_a_controlled_failure(self):
        connector = SpoolmanConnector("https://spoolman.example", logging.getLogger("test"), True)
        with patch("requests.get") as get:
            get.return_value.status_code = 200
            get.return_value.json.side_effect = ValueError("Invalid JSON")
            self.assertIn("error", connector.handleGetSpool("4"))


if __name__ == "__main__":
    unittest.main()
