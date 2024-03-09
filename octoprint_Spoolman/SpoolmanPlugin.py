import octoprint.plugin

from octoprint_Spoolman.api.PluginAPI import PluginAPI

class SpoolmanPlugin(
    PluginAPI,
    octoprint.plugin.StartupPlugin,
    octoprint.plugin.AssetPlugin,
    octoprint.plugin.TemplatePlugin,
    octoprint.plugin.SettingsPlugin,
):
    def on_after_startup(self):
        self._logger.info("Hello World!")

    # --- Mixins ---

    # AssetPlugin
    def get_assets(self):
        return {
            "js": [
                "js/common/api.js",
                "js/Spoolman_tab.js",
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
                "custom_bindings": True,
            }
        ]

    # SettingsPlugin
    def get_settings_defaults(self):
        settings = {
            "installed_version": self._plugin_version
        }

        return settings
