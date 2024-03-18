$(() => {
    // from setup.py plugin_identifier
    const PLUGIN_ID = "octoprint_Spoolman";

    function SpoolmanSidebarViewModel(params) {
        const self = this;

        // TODO: Improve DX
        const spoolmanSpoolsCachePromiseUtils = {
            resolve: () => {},
            reject: () => {},
        };
        const spoolmanSpoolsCachePromise = new Promise((resolve, reject) => {
            spoolmanSpoolsCachePromiseUtils.resolve = resolve;
            spoolmanSpoolsCachePromiseUtils.reject = reject;
        });

        self.settingsViewModel = params[0];

        const getSettings = () => {
            return self.settingsViewModel.settings.plugins[PLUGIN_ID];
        };

        // TODO: Share with other ViewModels?
        const apiClient = new APIClient(PLUGIN_ID, BASEURL);

        const initView = async () => {
            const request = await getSpoolmanSpools(apiClient);

            if (!request.isSuccess) {
                console.error("Request error", request.error);

                spoolmanSpoolsCachePromiseUtils.reject();

                return;
            }

            const spools = request.payload.response.data.spools;

            spoolmanSpoolsCachePromiseUtils.resolve(spools);

            updateSelectedSpools();
        };

        const updateSelectedSpools = async () => {
            self.templateData.isLoadingData(true);

            /** @type Spool[] */
            const spoolmanSpools = await spoolmanSpoolsCachePromise;

            self.templateData.isLoadingData(false);

            const currentProfileData = self.settingsViewModel.printerProfiles.currentProfileData();
            const currentExtrudersCount = (
                currentProfileData
                    ? currentProfileData.extruder.count()
                    : 0
            );

            const extruders = Array.from({
                length: currentExtrudersCount
            }, () => undefined)

            // TODO: Use selectedSpoolIds()
            // const selectedSpoolIds = selectedSpoolIds();
            const selectedSpoolIds = [ getSettings().selectedSpoolId() ];
            const selectedSpools = extruders.map((_, extruderIdx) => {
                const spoolId = selectedSpoolIds[extruderIdx];

                return spoolmanSpools.find((spool) => String(spool.id) === spoolId);
            });

            self.templateData.selectedSpoolsByToolIdx(selectedSpools);
            self.templateData.selectedSpoolsByToolIdx.valueHasMutated();
        };

        /**
         * @param {number} toolIdx
         */
        const handleSelectSpool = (toolIdx) => {};

        /**
         * @param {number} toolIdx
         */
        const handleDeselectSpool = (toolIdx) => {};

        /** Bindings for the template */
        self.constants = {
            weight_unit: 'g',
        };
        self.templateApi = {
            handleSelectSpool,
            handleDeselectSpool,
        };
        self.templateData = {
            isLoadingData: ko.observable(true),
            selectedSpoolsByToolIdx: ko.observable([]),
        };
        /** -- end of bindings -- */

        self.onBeforeBinding = () => {
            /**
             * Update spools on printer's profile update,
             * to handle any potential tool-count changes.
             */
            self.settingsViewModel.printerProfiles.currentProfileData.subscribe(() => {
                void updateSelectedSpools();
            });
        };
        self.onAfterBinding = () => {
            initView();
        };
    };

    OCTOPRINT_VIEWMODELS.push({
        construct: SpoolmanSidebarViewModel,
        dependencies: [
            "settingsViewModel"
        ],
        elements: [
            document.querySelector("#sidebar_spoolman"),
        ]
    });
});
