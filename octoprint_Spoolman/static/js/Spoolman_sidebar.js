$(() => {
    // from setup.py plugin_identifier
    const PLUGIN_ID = "Spoolman";

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

                self.templateData.loadingError(request?.error?.response?.error ?? { code: 'unknown' });

                spoolmanSpoolsCachePromiseUtils.reject();

                return;
            }

            const spools = request.payload.response.data.spools;

            spoolmanSpoolsCachePromiseUtils.resolve(spools);

            updateSelectedSpools();
        };

        const updateSelectedSpools = async () => {
            try {
                self.templateData.loadingError(undefined);
                self.templateData.isLoadingData(true);

                /** @type Spool[] */
                const spoolmanSpools = await spoolmanSpoolsCachePromise;

                const currentProfileData = self.settingsViewModel.printerProfiles.currentProfileData();
                const currentExtrudersCount = (
                    currentProfileData
                        ? currentProfileData.extruder.count()
                        : 0
                );

                const extruders = Array.from({
                    length: currentExtrudersCount
                }, () => undefined)

                const selectedSpoolIds = getSettings().selectedSpoolIds;
                const selectedSpools = extruders.map((_, extruderIdx) => {
                    const spoolId = selectedSpoolIds[extruderIdx]?.spoolId();

                    return spoolmanSpools.find((spool) => String(spool.id) === spoolId);
                });

                self.templateData.selectedSpoolsByToolIdx(selectedSpools);
                self.templateData.selectedSpoolsByToolIdx.valueHasMutated();
            } catch (error) {
                // Do nothing
            } finally {
                self.templateData.isLoadingData(false);
            }
        };

        /**
         * @param {number} toolIdx
         */
        const handleSelectSpool = async (toolIdx) => {
            try {
                // TODO: Improve DX, maybe move to separate component

                self.templateData.modals.selectSpool.toolIdx(toolIdx);

                self.modals.selectSpool.modal("show");

                self.templateData.loadingError(undefined);
                self.templateData.modals.selectSpool.isLoadingData(true);

                /** @type Spool[] */
                const spoolmanSpools = await spoolmanSpoolsCachePromise;

                const selectedSpoolIds = getSettings().selectedSpoolIds;
                const toolSpoolId = selectedSpoolIds[toolIdx]?.spoolId();
                const toolSpool = spoolmanSpools.find((spool) => {
                    return String(spool.id) === toolSpoolId;
                });

                self.templateData.modals.selectSpool.toolCurrentSpool(toolSpool);
                self.templateData.modals.selectSpool.tableItemsOnCurrentPage(spoolmanSpools);
            } catch (error) {
                // Do nothing
            } finally {
                self.templateData.modals.selectSpool.isLoadingData(false);
            }
        };

        /**
         * @param {number} toolIdx
         */
        const handleDeselectSpool = async (toolIdx) => {
            const request = await updateActiveSpool(apiClient, { toolIdx, spoolId: undefined });

            if (!request.isSuccess) {
                console.error("Request error", request.error);

                throw new Error("Request error");
            }

            const settingsSavePromise = new Promise((resolve) => {
                // TODO: Investigate if `saveData` can replace custom API endpoint
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
            const request = await updateActiveSpool(apiClient, { toolIdx, spoolId });

            if (!request.isSuccess) {
                console.error("Request error", request.error);

                throw new Error("Request error");
            }

            const settingsSavePromise = new Promise((resolve) => {
                // TODO: Investigate if `saveData` can replace custom API endpoint
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
            loadingError: ko.observable(undefined),
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
