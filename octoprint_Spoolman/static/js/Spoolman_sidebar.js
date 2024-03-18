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

        self.modals = {
            selectSpool: $("#spoolman_modal_selectspool"),
        };

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
        const handleSelectSpool = async (toolIdx) => {
            // TODO: Improve DX, maybe move to separate component

            self.templateData.modals.selectSpool.toolIdx(toolIdx);

            self.modals.selectSpool.modal("show");

            self.templateData.modals.selectSpool.isLoadingData(true);

            /** @type Spool[] */
            const spoolmanSpools = await spoolmanSpoolsCachePromise;

            // TODO: Use selectedSpoolIds()
            // const selectedSpoolIds = selectedSpoolIds();
            const selectedSpoolIds = [ getSettings().selectedSpoolId() ];
            const toolSpoolId = selectedSpoolIds[toolIdx];
            const toolSpool = spoolmanSpools.find((spool) => {
                return String(spool.id) === toolSpoolId;
            });

            self.templateData.modals.selectSpool.toolCurrentSpool(toolSpool);
            self.templateData.modals.selectSpool.tableItemsOnCurrentPage(spoolmanSpools);

            self.templateData.modals.selectSpool.isLoadingData(false);
        };

        /**
         * @param {number} toolIdx
         */
        const handleDeselectSpool = async (toolIdx) => {
            const request = await updateActiveSpool(apiClient, { spoolId: undefined });

            if (!request.isSuccess) {
                console.error("Request error", request.error);

                throw new Error("Request error");
            }

            const settingsSavePromise = new Promise((resolve) => {
                // Force save empty data to trigger `settingsViewModel` reload
                self.settingsViewModel.saveData({}, resolve);
            });

            await settingsSavePromise;

            self.modals.selectSpool.modal("hide");

            updateSelectedSpools();
        };

        /**
         * @param {number} toolIdx
         * @param {number} spoolId
         */
        const handleSelectSpoolForTool = async (toolIdx, spoolId) => {
            const request = await updateActiveSpool(apiClient, { spoolId });

            if (!request.isSuccess) {
                console.error("Request error", request.error);

                throw new Error("Request error");
            }

            const settingsSavePromise = new Promise((resolve) => {
                // Force save empty data to trigger `settingsViewModel` reload
                self.settingsViewModel.saveData({}, resolve);
            });

            await settingsSavePromise;

            self.modals.selectSpool.modal("hide");

            updateSelectedSpools();
        };

        /** Bindings for the template */
        self.constants = {
            weight_unit: 'g',
        };
        self.templateApi = {
            handleSelectSpool,
            handleDeselectSpool,

            modals: {
                selectSpool: {
                    handleSelectSpoolForTool,
                },
            },
        };
        self.templateData = {
            isLoadingData: ko.observable(true),
            selectedSpoolsByToolIdx: ko.observable([]),

            modals: {
                selectSpool: {
                    isLoadingData: ko.observable(true),

                    toolIdx: ko.observable(undefined),
                    toolCurrentSpool: ko.observable(undefined),

                    tableAttributeVisibility: {
                        id: true,
                        spoolName: true,
                        material: true,
                        weight: true,
                    },
                    tableItemsOnCurrentPage: ko.observable([]),
                },
            },
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
            document.querySelector("#spoolman_modal_selectspool"),
        ]
    });
});
