import octoprint.plugin

from octoprint_Spoolman.api.PluginAPI import PluginAPI
from octoprint_Spoolman.common.settings import SettingsKeys

class SpoolmanPlugin(
    PluginAPI,
    octoprint.plugin.StartupPlugin,
    octoprint.plugin.AssetPlugin,
    octoprint.plugin.TemplatePlugin,
    octoprint.plugin.SettingsPlugin,
):
    def on_after_startup(self):
        self._logger.info("[Spoolman][init] Plugin activated")

    # --- Mixins ---

    # AssetPlugin
    def get_assets(self):
        return {
            "js": [
                "js/common/api.js",
                "js/api/getSpoolmanSpools.js",
                "js/Spoolman_tab.js",
                "js/Spoolman_settings.js",
            ],
            "css": [],
            "less": [],
        }

    # TemplatePlugin
    def get_template_configs(self):
        return [
            {
                "type": "tab",
                "template": "Spoolman_tab.jinja2",
            },
            {
                "type": "settings",
                "template": "Spoolman_settings.jinja2",
            }
        ]

    # SettingsPlugin
    def get_settings_defaults(self):
        settings = {
            "installed_version": self._plugin_version,
            SettingsKeys.SPOOLMAN_URL: "",
            SettingsKeys.LOGGING_IS_ENABLED: False,
        }

        return settings

    def on_settings_save(self, data):
        self._logger.info("[Spoolman][Settings] Saved data")

        octoprint.plugin.SettingsPlugin.on_settings_save(self, data)
