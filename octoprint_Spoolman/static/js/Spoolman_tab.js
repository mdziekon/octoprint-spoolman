// from setup.py plugin_identifier
const PLUGIN_ID = "octoprint_Spoolman";

$(() => {
    function SpoolmanViewModel(params) {
        const self = this;

        self.settingsViewModel = params[0];

        self.pluginSettings = null;

        const apiClient = new APIClient(PLUGIN_ID, BASEURL);

        const initPlugin = () => {
            const $resultEl = document.querySelector(".spoolman_tab__placeholder_connect_result");

            document.querySelector(".spoolman_tab__btn_connect").addEventListener("click", async () => {
                const request = await apiClient.callApi("spoolman/spools", {});

                if (!request.isSuccess) {
                    console.error("Request error", request.error);

                    $resultEl.innerHTML = "Request failed";

                    return;
                }

                console.log("Request success", request.payload.response);

                $resultEl.innerHTML = "Request succeeded";
            });
        }

        self.onBeforeBinding = () => {
            self.pluginSettings = self.settingsViewModel.settings.plugins[PLUGIN_ID];
        };

        self.onAfterBinding = () => {
            initPlugin();
        };
    };

    OCTOPRINT_VIEWMODELS.push({
        construct: SpoolmanViewModel,
        dependencies: [
            "settingsViewModel"
        ],
        elements: [
            document.querySelector("#settings_spoolman"),
        ]
    });
});
